import { sjekkLinjer } from './ordre.ts'
import { sjekkPeriode } from './tolk-timer.ts'

/* ═══════════════════════════════════════════════════════════
   Regler for å sende timer til en Tripletex-ordre: hva en kropp må
   inneholde, hva hvert svar fra Tripletex betyr for sendingen, og hvilke
   statusoverganger som er lov. Ingen nett, ingen database.

   Hovedregelen bak vurder(): «feilet» betyr at ingenting som kan
   faktureres, er lagt inn, og at timene kan sendes på nytt. Er det tvil,
   blir det «ukjent_utfall», som sperrer timene til et menneske har sett
   på ordren. En sperret time er bryderi; en dobbel faktura er verre.
   ═══════════════════════════════════════════════════════════ */

export type Sendestatus =
  | 'startet'
  | 'sendt'
  | 'sendt_uten_vedlegg'
  | 'sendt_uten_merke'
  | 'ukjent_utfall'
  | 'feilet'
  | 'angret'

export type Linje = { produktId: number | null; antall: number; tekst: string }

export type Sendeinput = {
  prosjekt: string
  ordre: { ny: true } | { id: number }
  linjer: Linje[]
  timerIder: number[]
  pdf: Uint8Array
  filnavn: string
  periode: { fra: string; til: string }
}

export const MAKS_PDF_BYTE = 4 * 1024 * 1024
const MAKS_BASE64 = Math.ceil(MAKS_PDF_BYTE / 3) * 4
/** Overlappsjekken går i biter på 200 id-er i adressen; 3000 gir høyst 15 oppslag. */
export const MAKS_TIMER = 3000
/** Kolonnen timer_ider er int[] (32 bit). */
const MAKS_INT = 2_147_483_647

function objekt(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null
}

const positivtHeltall = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x > 0

function sjekkOrdrevalg(x: unknown): Sendeinput['ordre'] | null {
  const o = objekt(x)
  if (!o) return null
  const nøkler = Object.keys(o)
  if (nøkler.length === 1 && o.ny === true) return { ny: true }
  if (nøkler.length === 1 && positivtHeltall(o.id)) return { id: o.id }
  return null
}

function sjekkTimerIder(x: unknown): number[] | string {
  if (!Array.isArray(x) || x.length === 0) return 'Ingen timer å merke i SmartDok.'
  if (x.length > MAKS_TIMER) return `Høyst ${MAKS_TIMER} timer per sending.`
  if (!x.every((id) => positivtHeltall(id) && id <= MAKS_INT)) return 'Time-id-ene må være positive heltall.'
  if (new Set(x).size !== x.length) return 'Samme time er med to ganger.'
  return x as number[]
}

/** Streng base64: Buffer.from hopper stille over tegn som ikke hører hjemme, og da kunne en ødelagt fil gått videre. */
function sjekkPdf(x: unknown): Uint8Array | string {
  if (typeof x !== 'string' || x.length === 0) return 'PDF-en mangler.'
  if (x.length > MAKS_BASE64) return 'PDF-en er større enn 4 MB.'
  if (x.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(x)) return 'PDF-en er ikke gyldig base64.'
  const byte = Buffer.from(x, 'base64')
  if (byte.length > MAKS_PDF_BYTE) return 'PDF-en er større enn 4 MB.'
  if (byte.subarray(0, 4).toString('latin1') !== '%PDF') return 'Filen er ikke en PDF.'
  return new Uint8Array(byte.buffer, byte.byteOffset, byte.length)
}

function sjekkFilnavn(x: unknown): string | null {
  if (typeof x !== 'string' || x.length < 1 || x.length > 120) return null
  // Navnet havner i Content-Disposition; anførselstegn, skråstreker og linjeskift kan bryte den.
  if (/[\u0000-\u001f\u007f"\\/]/.test(x)) return null
  if (!/\.pdf$/i.test(x)) return null
  return x
}

/** Kroppen til legg-paa-ordre. Norsk melding ved første feil. */
export function sjekkSending(x: unknown): Sendeinput | string {
  const b = objekt(x)
  if (!b) return 'Ugyldig forespørsel.'

  const prosjekt = typeof b.prosjekt === 'string' ? b.prosjekt.trim() : ''
  if (!prosjekt || prosjekt.length > 50) return 'Velg et prosjekt.'

  const ordre = sjekkOrdrevalg(b.ordre)
  if (!ordre) return 'Velg ny ordre eller en eksisterende ordre.'

  const linjer = sjekkLinjer(b.linjer)
  if (typeof linjer === 'string') return linjer

  const timerIder = sjekkTimerIder(b.timerIder)
  if (typeof timerIder === 'string') return timerIder

  const pdf = sjekkPdf(b.pdf)
  if (typeof pdf === 'string') return pdf

  const filnavn = sjekkFilnavn(b.filnavn)
  if (!filnavn) return 'Filnavnet må være 1 til 120 tegn, slutte på .pdf og ikke ha anførselstegn eller skråstrek.'

  const p = objekt(b.periode)
  const fra = typeof p?.fra === 'string' ? p.fra : ''
  const til = typeof p?.til === 'string' ? p.til : ''
  const periodefeil = sjekkPeriode(fra, til)
  if (periodefeil) return periodefeil

  return { prosjekt, ordre, linjer, timerIder, pdf, filnavn, periode: { fra, til } }
}

/** Koden fra lagKode(). Alt annet avvises før det når databasen. */
export function sjekkKode(x: unknown): string | null {
  const k = objekt(x)?.kode
  return typeof k === 'string' && /^[a-z0-9]{6}$/.test(k) ? k : null
}

export type Avklaring = 'sjekk' | 'frigi' | 'merk'

export function sjekkAvklar(x: unknown): { kode: string; valg: Avklaring; bekreftetLinjer: boolean } | string {
  const kode = sjekkKode(x)
  if (!kode) return 'Ugyldig sendingskode.'
  const valg = objekt(x)?.valg
  if (valg !== 'sjekk' && valg !== 'frigi' && valg !== 'merk') return 'Ukjent valg.'
  // Bekreftelsen åpner for å merke timer på en eksisterende ordre. Bare ekte true teller,
  // så «"true"» eller 1 fra en feil klient ikke blir en bekreftelse ingen har gitt.
  const bekreftet = objekt(x)?.bekreftetLinjer
  if (bekreftet !== undefined && typeof bekreftet !== 'boolean') return 'Ugyldig bekreftelse.'
  return { kode, valg, bekreftetLinjer: bekreftet === true }
}

/* ── Hva et svar betyr ─────────────────────────────────────── */

export type Steg = 'ny_ordre' | 'hent_ordre' | 'kommentar' | 'pris' | 'linjer' | 'vedlegg' | 'merke'
/** HTTP-status, eller 'brudd' når svaret aldri kom (tidsavbrudd, nettfeil). */
export type Utfall = number | 'brudd'
export type Vurdering = 'ok' | 'feilet' | 'ukjent_utfall' | 'sendt_uten_vedlegg' | 'sendt_uten_merke'

export function vurder(steg: Steg, utfall: Utfall): Vurdering {
  if (typeof utfall === 'number' && utfall >= 200 && utfall < 300) return 'ok'
  switch (steg) {
    case 'ny_ordre':
    case 'linjer':
      // En ren 4xx betyr at Tripletex avviste og ikke skrev noe (også 401 og 429).
      // Alt annet kan ha blitt utført før svaret falt bort.
      return typeof utfall === 'number' && utfall >= 400 && utfall < 500 ? 'feilet' : 'ukjent_utfall'
    case 'hent_ordre':
    case 'pris':
    // Kommentaren er ikke noe som faktureres. Har den kommet inn uten linjer, er ordren
    // som før med en ekstra linje tekst, og timene kan trygt sendes igjen.
    case 'kommentar':
      return 'feilet'
    case 'vedlegg':
      return 'sendt_uten_vedlegg'
    case 'merke':
      return 'sendt_uten_merke'
  }
}

/** Uten merke er det verst: da står timene som ikke sendt i SmartDok og kan sendes igjen der. */
export function sluttstatus(vedleggOk: boolean, merkeOk: boolean): 'sendt' | 'sendt_uten_vedlegg' | 'sendt_uten_merke' {
  if (!merkeOk) return 'sendt_uten_merke'
  if (!vedleggOk) return 'sendt_uten_vedlegg'
  return 'sendt'
}

/* ── Overganger ────────────────────────────────────────────── */

/**
 * En sending lever høyst maxDuration (120 s). Står den fortsatt som startet
 * etter ti minutter, døde funksjonen underveis, og vi vet ikke hvor langt den kom.
 */
export const FORELDET_MS = 10 * 60 * 1000

export function gjeldendeStatus(status: Sendestatus, endret: string, naa: number): Sendestatus {
  if (status !== 'startet') return status
  const t = Date.parse(endret)
  if (!Number.isFinite(t) || naa - t > FORELDET_MS) return 'ukjent_utfall'
  return status
}

export type Handling = 'fjern-merke' | 'frigi' | 'merk' | 'sjekk'

const LOV: Record<Handling, Sendestatus[]> = {
  'fjern-merke': ['sendt', 'sendt_uten_vedlegg', 'sendt_uten_merke'],
  frigi: ['ukjent_utfall', 'sendt_uten_merke'],
  merk: ['ukjent_utfall', 'sendt_uten_merke'],
  sjekk: ['sendt', 'sendt_uten_vedlegg', 'sendt_uten_merke', 'ukjent_utfall', 'feilet', 'angret'],
}

/** Tar gjeldende status (etter gjeldendeStatus), ikke den lagrede. */
export function tillatt(handling: Handling, status: Sendestatus): boolean {
  return LOV[handling].includes(status)
}

/**
 * Merk etter ukjent utfall. På en ordre vi selv laget, er alle linjene våre,
 * så «funnet med linjer» betyr at timene er lagt på. På en eksisterende ordre
 * kan linjene ha stått der fra før, og vi kan ikke se om våre kom inn: der
 * må et menneske se i Tripletex og bekrefte det (`bekreftetLinjer`). En feil
 * bekreftelse gir timer som ikke faktureres, aldri dobbel faktura.
 *
 * `nyOrdre` er kolonnen ny_ordre, satt da sendingen startet. Null skal ikke
 * forekomme, men regnes som eksisterende ordre: det er den trygge siden.
 */
export function kanMerke(
  status: Sendestatus,
  nyOrdre: boolean | null,
  funn: { funnet: boolean; antallLinjer: number; ordrenummer: string | null } | null,
  bekreftetLinjer = false,
): string | null {
  if (status === 'sendt_uten_merke') return null
  if (status !== 'ukjent_utfall') return 'Sendingen kan ikke merkes nå.'
  if (!funn || !funn.funnet) return 'Fant ingen ordre med sendingens kode i Tripletex. Timene merkes ikke; frigi sendingen i stedet.'
  // En ordre uten linjer har sikkert ikke våre heller, uansett hva noen bekrefter.
  if (funn.antallLinjer === 0) {
    return `Ordre ${funn.ordrenummer} har ingen linjer. Timene merkes ikke; frigi sendingen i stedet.`
  }
  if (nyOrdre !== true && !bekreftetLinjer) {
    return (
      `Ordre ${funn.ordrenummer} er en eksisterende ordre, og vi kan ikke se om linjene fra denne sendingen kom inn. ` +
      'Se på ordren i Tripletex: står linjene der, bekreft det og merk som sendt; mangler de, frigi sendingen og send på nytt.'
    )
  }
  return null
}

/**
 * Svaret etter «Frigi». `avmerket` er merket vi prøvde å fjerne i SmartDok
 * (bare fra sendt_uten_merke), ellers null. Meldingen lover ikke mer enn det
 * som faktisk skjedde: feilet avmerkingen, må merket fjernes for hånd.
 */
export function frigiMelding(avmerket: string | null, avmerkingFeilet: boolean): string {
  const iSmartdok =
    avmerket === null
      ? ''
      : avmerkingFeilet
        ? `Merket i SmartDok kunne ikke fjernes: se etter timer merket «${avmerket}» der og fjern merket for hånd. `
        : 'Eventuelle merker i SmartDok er fjernet. '
  return `Timene er frigitt og kan sendes på nytt. ${iSmartdok}Se på ordren i Tripletex først, så de ikke faktureres to ganger.`
}

/**
 * Meldingen når en annen sending holder på noen av timene. Statusen regnes som
 * gjeldende: en «startet» som døde underveis, går ikke over av seg selv ved å
 * prøve igjen, den må avklares.
 */
export function kollisjonsmelding(
  treff: { kode: string; ordrenummer: string | null; status: Sendestatus; endret: string },
  naa: number,
): string {
  const status = gjeldendeStatus(treff.status, treff.endret, naa)
  if (status === 'startet') return `Timene sendes akkurat nå fra et annet sted (sending ${treff.kode}). Prøv igjen.`
  if (status === 'ukjent_utfall') {
    return (
      `Timene ligger i sending ${treff.kode}, der vi ikke vet om ordren ble laget i Tripletex. ` +
      `Avklar sending ${treff.kode} før timene sendes på nytt.`
    )
  }
  return (
    `Timene er alt sendt til ordre ${treff.ordrenummer ?? '(ikke avklart)'} (sending ${treff.kode}). ` +
    `Fjern merket eller avklar sending ${treff.kode} før timene sendes på nytt.`
  )
}

/* ── Frister og biter ──────────────────────────────────────── */

/**
 * Linjene sendes ikke senere enn dette etter start. Før linjene er ingenting
 * fakturerbart gjort, så å stoppe her er trygt; blir funksjonen drept ETTER
 * linjene, er utfallet ukjent og må avklares for hånd.
 *
 * Regnestykket mot maxDuration 120 s, med tidsavbruddene som øvre grenser:
 *   45 frist + 20 linjer + 20 vedlegg + 15 SmartDok-token + 15 merke = 115 s.
 * Svarer SmartDok 429, kommer opptil 10 s pause og 15 s nytt kall i tillegg
 * (140 s). Det går bare over når alle tjenestene henger samtidig, og da ender
 * sendingen som ukjent utfall, ikke dobbelt. Skal også det tilfellet få plass,
 * må fristen ned til 20 s.
 */
export const FRIST_LINJER_MS = 45_000

export function forSentForLinjer(start: number, naa: number): boolean {
  return naa - start > FRIST_LINJER_MS
}

export function delIBiter<T>(liste: T[], n: number): T[][] {
  const ut: T[][] = []
  for (let i = 0; i < liste.length; i += n) ut.push(liste.slice(i, i + n))
  return ut
}

/* ── Kommentaren på ordren ─────────────────────────────────── */

const FORSTAVELSE = 'SmartDok til PDF '

/** Koden står i kommentaren så ordren kan finnes igjen; om ordren er ny, sier ny_ordre i navet. */
export function kommentar(kode: string, fra: string, til: string): string {
  return `${FORSTAVELSE}${kode}, ${fra}–${til}`
}

export function medKommentar(eksisterende: unknown, tillegg: string): string {
  const før = typeof eksisterende === 'string' ? eksisterende.trim() : ''
  return før ? `${før} ${tillegg}` : tillegg
}

/** Hele «SmartDok til PDF <kode>,» så seks tilfeldige tegn ellers i teksten ikke gir falskt treff. */
export function harKode(internalComment: unknown, kode: string): boolean {
  return typeof internalComment === 'string' && internalComment.includes(`${FORSTAVELSE}${kode},`)
}

/* ── Svar fra Tripletex ────────────────────────────────────── */

function verdi(json: unknown): Record<string, unknown> | null {
  return objekt(objekt(json)?.value)
}

/**
 * Prisen fra orderLineTemplate. Ordren i Tripletex er godkjenningen, så et felt
 * som mangler, er null eller 0 gir 0 i stedet for stopp. Mangler selve value, eller
 * er prisen negativ eller ikke et tall, har svaret endret form: null stopper
 * sendingen, ellers ville alle produktlinjer fått 0 kr uten at noen merket det.
 */
export function tolkPris(json: unknown): number | null {
  const v = verdi(json)
  if (v === null) return null
  const p = v.unitPriceExcludingVatCurrency
  if (p === undefined || p === null) return 0
  return typeof p === 'number' && Number.isFinite(p) && p >= 0 ? p : null
}

/**
 * Pris og rabatt fra orderLineTemplate. Rabatten (prosent) er kundens avtale i
 * Tripletex og skal følge med linjen; uten den ville kunden fått full pris.
 * Mangler rabatten, er det ingen. En rabatt vi ikke forstår, stopper sendingen
 * (null): å gjette 0 ville gitt kunden full pris.
 */
export function tolkMal(json: unknown): { pris: number; rabatt: number } | null {
  const pris = tolkPris(json)
  if (pris === null) return null
  const d = verdi(json)?.discount
  if (d === undefined || d === null) return { pris, rabatt: 0 }
  if (typeof d !== 'number' || !Number.isFinite(d) || d < 0 || d > 100) return null
  return { pris, rabatt: d }
}

/** Tekstlinjer (uten produkt) og nullprislinjer, til loggen så det kan ses hvor mye som må fylles ut i Tripletex. */
export function tellUtfylling(linjer: { produktId: number | null; pris: number }[]): { tekstlinjer: number; nullprisLinjer: number } {
  return {
    tekstlinjer: linjer.filter((l) => l.produktId === null).length,
    nullprisLinjer: linjer.filter((l) => l.produktId !== null && l.pris === 0).length,
  }
}

function nummer(x: unknown): string | null {
  if (typeof x === 'string' && x) return x
  if (typeof x === 'number' && Number.isFinite(x)) return String(x)
  return null
}

export function tolkNyOrdre(json: unknown): { id: number; nummer: string } | null {
  const v = verdi(json)
  if (!v || !positivtHeltall(v.id)) return null
  const n = nummer(v.number)
  return n ? { id: v.id, nummer: n } : null
}

export type Ordreinfo = {
  id: number
  versjon: number
  nummer: string
  /** Null når Tripletex ikke sa noe: regnes ikke som åpen. */
  lukket: boolean | null
  /** isPrioritizeAmountsIncludingVat. Null når ukjent: regnes ikke som eks. mva. */
  prisInklMva: boolean | null
  prosjektId: number | null
  kommentar: string
  antallLinjer: number
}

export function tolkOrdre(json: unknown): Ordreinfo | null {
  const v = verdi(json)
  if (!v || !positivtHeltall(v.id)) return null
  if (typeof v.version !== 'number' || !Number.isSafeInteger(v.version) || v.version < 0) return null
  const n = nummer(v.number)
  if (!n) return null
  const prosjektId = objekt(v.project)?.id
  return {
    id: v.id,
    versjon: v.version,
    nummer: n,
    lukket: typeof v.isClosed === 'boolean' ? v.isClosed : null,
    prisInklMva: typeof v.isPrioritizeAmountsIncludingVat === 'boolean' ? v.isPrioritizeAmountsIncludingVat : null,
    prosjektId: positivtHeltall(prosjektId) ? prosjektId : null,
    kommentar: typeof v.internalComment === 'string' ? v.internalComment : '',
    antallLinjer: Array.isArray(v.orderLines) ? v.orderLines.length : 0,
  }
}

export type Kodetreff = { id: number; nummer: string; antallLinjer: number }

export function ordrerMedKode(values: unknown[], kode: string): Kodetreff[] {
  const ut: Kodetreff[] = []
  for (const x of values) {
    const o = objekt(x)
    if (!o || !harKode(o.internalComment, kode) || !positivtHeltall(o.id)) continue
    const n = nummer(o.number)
    if (!n) continue
    ut.push({ id: o.id, nummer: n, antallLinjer: Array.isArray(o.orderLines) ? o.orderLines.length : 0 })
  }
  return ut
}

/** Et ok-svar med færre linjer enn sendt er ikke noe vi forstår, og regnes som ukjent. */
export function linjeneKomInn(json: unknown, antall: number): boolean {
  const v = objekt(json)?.values
  return Array.isArray(v) && v.length === antall
}

/** Til loggen. Tripletex regner selv det som faktureres; dette er vårt overslag med rabatten trukket fra. */
export function sumEksMva(linjer: { antall: number; pris: number; rabatt?: number }[]): number {
  return Math.round(linjer.reduce((s, l) => s + l.antall * l.pris * (1 - (l.rabatt ?? 0) / 100), 0) * 100) / 100
}

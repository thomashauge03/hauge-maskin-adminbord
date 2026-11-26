import { logg } from '@/lib/data'
import { isoDato, leggTilDager } from '@/lib/format'
import { skrivTilSmartdok } from '@/lib/prosjekter/smartdok'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { lagKode, lagMerke, overlapp, tolkProsjekt } from '@/lib/smartdok-pdf/ordre'
import {
  delIBiter,
  forSentForLinjer,
  gjeldendeStatus,
  harKode,
  kanMerke,
  kollisjonsmelding,
  kommentar,
  linjeneKomInn,
  medKommentar,
  ordrerMedKode,
  sluttstatus,
  sumEksMva,
  tillatt,
  tolkMal,
  tolkNyOrdre,
  tolkOrdre,
  vurder,
  type Avklaring,
  type Sendeinput,
  type Sendestatus,
  type Utfall,
} from '@/lib/smartdok-pdf/sending'
import { apneTripletex, type Tripletexøkt } from '@/lib/smartdok-pdf/tripletex'
import { hentAlleSider } from '@/lib/smartdok-pdf/tripletex-sider'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Timer fra SmartDok på en ordre i Tripletex, og oppryddingen etterpå.

   Rekkefølgen i sendOrdre er det som verner mot dobbel faktura: raden i
   smartdok_pdf_sending skrives FØR noe går til Tripletex, og ordre-id og
   ordrenummer lagres så snart de er kjent. Dør funksjonen underveis, står
   raden som «startet» og sperrer timene; etter ti minutter regnes den som
   ukjent utfall og kan avklares.

   Hver statusendring er betinget av statusen vi leste (.eq('status', …)),
   så to klikk ikke begge kan flytte samme sending.

   Svarteksten fra Tripletex og SmartDok går aldri videre, verken til
   brukeren eller i loggen: bare status, id-er og våre egne meldinger.
   ═══════════════════════════════════════════════════════════ */

type Bruker = { id: string; epost: string }

/** Det rutene svarer med. */
export type Resultat = { http: number; kropp: Record<string, unknown> }

const TABELL = 'smartdok_pdf_sending'
/** Id-er per overlappsoppslag, så adressen til PostgREST holder seg kort. */
const BIT = 200

type Rad = {
  kode: string
  prosjekt: string
  ordre_id: number | null
  ordrenummer: string | null
  merke: string | null
  timer_ider: number[]
  status: Sendestatus
  antall_linjer: number | null
  /** Sant når sendingen selv laget ordren. Null regnes som eksisterende ordre. */
  ny_ordre: boolean | null
  opprettet: string
  endret: string
}

type Aktiv = { kode: string; ordrenummer: string | null; timer_ider: number[]; status: Sendestatus; endret: string }

const STATUSORD: Record<Sendestatus, string> = {
  startet: 'under sending',
  sendt: 'sendt',
  sendt_uten_vedlegg: 'sendt uten vedlegg',
  sendt_uten_merke: 'sendt uten merke i SmartDok',
  ukjent_utfall: 'uavklart (ukjent utfall)',
  feilet: 'feilet',
  angret: 'angret',
}

const feilsvar = (feil: string, http: number): Resultat => ({ http, kropp: { feil } })

/** En databasefeil vi ikke kan gå videre fra. Meldingen fra Supabase siteres ikke. */
class Lagringsfeil extends Error {}

const ok = (u: Utfall) => typeof u === 'number' && u >= 200 && u < 300
const statustekst = (u: Utfall) => (u === 'brudd' ? 'uten svar' : `status ${u}`)

/** Ett kall mot Tripletex. Kaster aldri: et kall som ikke fikk svar, blir 'brudd'. */
async function prøv(okt: Tripletexøkt, sti: string, init?: RequestInit): Promise<{ utfall: Utfall; json: unknown }> {
  try {
    const s = init ? await okt.send(sti, init) : await okt.hent(sti)
    return { utfall: s.status, json: s.json }
  } catch {
    return { utfall: 'brudd', json: null }
  }
}

const json = (metode: 'POST' | 'PUT', kropp: unknown): RequestInit => ({
  method: metode,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(kropp),
})

const merkesti = (merke: string) =>
  `/WorkHours/SetExportedExternal?exportedExternalId=${encodeURIComponent(merke)}&setAsExportedExternal=true`
const avmerkesti = (merke: string) => `/WorkHours/UnmarkExportedExternal?exportedExternalId=${encodeURIComponent(merke)}`

/* ── Databasen ─────────────────────────────────────────────── */

/**
 * Flytter en sending fra én status, med feltene som følger. Usant når
 * statusen ikke lenger var `fra` (noen andre rakk det først). `endret`
 * låser i tillegg på tidspunktet vi leste, for overganger startet utenfra.
 */
async function flytt(kode: string, fra: Sendestatus, felt: Record<string, unknown>, endret?: string): Promise<boolean> {
  let q = supabaseAdmin
    .from(TABELL)
    .update({ ...felt, endret: new Date().toISOString() })
    .eq('kode', kode)
    .eq('status', fra)
  if (endret) q = q.eq('endret', endret)
  const { data, error } = await q.select('kode')
  if (error) throw new Lagringsfeil()
  return (data?.length ?? 0) === 1
}

async function hentRad(kode: string): Promise<Rad | null> {
  const { data, error } = await supabaseAdmin
    .from(TABELL)
    .select('kode, prosjekt, ordre_id, ordrenummer, merke, timer_ider, status, antall_linjer, ny_ordre, opprettet, endret')
    .eq('kode', kode)
    .maybeSingle()
  if (error) throw new Lagringsfeil()
  return (data as Rad | null) ?? null
}

/**
 * Sendinger som fortsatt holder på noen av timene, unntatt `utenKode`. I biter
 * på 200 id-er: 3000 id-er i én adresse ville sprengt grensen hos PostgREST.
 */
async function hentAktive(timerIder: number[], utenKode?: string): Promise<Aktiv[]> {
  const funnet = new Map<string, Aktiv>()
  for (const bit of delIBiter(timerIder, BIT)) {
    let q = supabaseAdmin
      .from(TABELL)
      .select('kode, ordrenummer, timer_ider, status, endret')
      .overlaps('timer_ider', bit)
      .not('status', 'in', '(angret,feilet)')
    if (utenKode !== undefined) q = q.neq('kode', utenKode)
    const { data, error } = await q
    if (error) throw new Lagringsfeil()
    for (const a of (data ?? []) as Aktiv[]) funnet.set(a.kode, a)
  }
  return [...funnet.values()]
}

/** Første aktive sending som deler en time med denne, med status til meldingen. */
function kollisjon(timerIder: number[], aktive: Aktiv[]): Aktiv | null {
  const treff = overlapp(timerIder, aktive)
  return treff ? (aktive.find((a) => a.kode === treff.kode) ?? null) : null
}

/** Prosjektet i Tripletex med eksakt samme nummer. Resultat ved feil. */
async function finnProsjekt(okt: Tripletexøkt, nummer: string): Promise<{ id: number; kundeId: number } | Resultat> {
  const p = await prøv(okt, `/project?number=${encodeURIComponent(nummer)}&fields=id,number,customer(id)&from=0&count=1000`)
  if (!ok(p.utfall)) return feilsvar(`Kunne ikke slå opp prosjektet i Tripletex (${statustekst(p.utfall)}). Ingenting er sendt.`, 502)
  let funnet
  try {
    funnet = tolkProsjekt(p.json, nummer)
  } catch (e) {
    return feilsvar(e instanceof Error ? e.message : 'Uventet svar fra Tripletex.', 502)
  }
  if (funnet === 'ingen') return feilsvar(`Fant ikke prosjekt ${nummer} i Tripletex.`, 409)
  if (funnet === 'flere') return feilsvar(`Flere prosjekter med nummer ${nummer} i Tripletex.`, 409)
  return funnet
}

/* ── Legg på ordre ─────────────────────────────────────────── */

export async function sendOrdre(inn: Sendeinput, bruker: Bruker): Promise<Resultat> {
  const start = Date.now()

  let okt: Tripletexøkt
  try {
    okt = await apneTripletex()
  } catch (e) {
    return feilsvar(e instanceof Error ? e.message : 'Fikk ikke kontakt med Tripletex.', 502)
  }

  const prosjekt = await finnProsjekt(okt, inn.prosjekt)
  if ('http' in prosjekt) return prosjekt

  // Raden skrives før noe går til Tripletex, og en ny sending som deler en time med en aktiv, avvises.
  let kode = ''
  let radSkrevet = false
  try {
    const treff = kollisjon(inn.timerIder, await hentAktive(inn.timerIder))
    if (treff) return feilsvar(kollisjonsmelding(treff, Date.now()), 409)

    for (let forsøk = 0; forsøk < 3 && !radSkrevet; forsøk++) {
      kode = lagKode()
      const { error } = await supabaseAdmin
        .from(TABELL)
        .insert({
          kode,
          prosjekt: inn.prosjekt,
          timer_ider: inn.timerIder,
          status: 'startet',
          // Skrevet før ordren finnes, så «merk» etter ukjent utfall vet om alle linjene på ordren er våre.
          ny_ordre: 'ny' in inn.ordre,
          opprettet_av: bruker.id,
        })
      if (!error) radSkrevet = true
      // 23505: koden fantes fra før. Alt annet er en feil vi ikke skal prøve oss forbi.
      else if (error.code !== '23505') throw new Lagringsfeil()
    }
    if (!radSkrevet) throw new Lagringsfeil()

    /*
     * To samtidige sendinger kan begge ha passert sjekken over. Sjekken gjøres
     * derfor på nytt mot ALLE andre aktive rader, ikke bare eldre: id-en deles ut
     * ved innsetting, ikke ved commit, så «lavest id vinner» kan slippe begge
     * gjennom. Ser begge hverandre, gir begge opp; det er trygt, og brukeren
     * prøver igjen.
     */
    const andre = kollisjon(inn.timerIder, await hentAktive(inn.timerIder, kode))
    if (andre) {
      await flytt(kode, 'startet', { status: 'feilet' })
      return feilsvar(kollisjonsmelding(andre, Date.now()), 409)
    }
  } catch {
    if (radSkrevet) await flytt(kode, 'startet', { status: 'feilet' }).catch(() => false)
    return feilsvar('Kunne ikke lagre sendingen. Ingenting er sendt til Tripletex.', 500)
  }

  const s = { ordreId: null as number | null, ordrenummer: null as string | null, ny: 'ny' in inn.ordre }
  // Satt når Tripletex kan ha fått noe som faktureres: en ny ordre eller linjer.
  let kanVæreSkrevet = false
  const linjer: { produktId: number; antall: number; pris: number; rabatt: number; tekst: string }[] = []

  const logget = async (status: Sendestatus) => {
    await logg('smartdok_pdf.ordre_sendt', {
      utfortAv: bruker.id,
      utfortAvEpost: bruker.epost,
      detaljer: {
        kode,
        prosjekt: inn.prosjekt,
        ordrenummer: s.ordrenummer,
        status,
        antallLinjer: linjer.length,
        sumEksMva: linjer.length ? sumEksMva(linjer) : null,
      },
    })
  }

  const tomOrdre = () =>
    s.ny && s.ordrenummer
      ? ` Ordre ${s.ordrenummer} ble opprettet og står tom i Tripletex: slett den der, eller velg den som eksisterende ordre neste gang.`
      : ''

  const avslutt = async (status: 'feilet' | 'ukjent_utfall', melding: string, http = 502): Promise<Resultat> => {
    let lagret = false
    try {
      lagret = await flytt(kode, 'startet', { status })
    } catch {
      // Raden blir stående som startet og sperrer timene; etter ti minutter kan den avklares.
    }
    if (!lagret) melding += ' Statusen kunne ikke lagres: sendingen sperrer timene til den er avklart.'
    await logget(status)
    if (status === 'feilet') return { http, kropp: { feil: melding, kode } }
    return {
      http: 200,
      kropp: { status, kode, ordrenummer: s.ordrenummer, ordreId: s.ordreId, linjer: [], melding },
    }
  }

  try {
    /* 1. Ordren */
    if ('ny' in inn.ordre) {
      const idag = isoDato(Date.now())
      kanVæreSkrevet = true
      const r = await prøv(
        okt,
        '/order',
        json('POST', {
          customer: { id: prosjekt.kundeId },
          project: { id: prosjekt.id },
          orderDate: idag,
          deliveryDate: idag,
          internalComment: kommentar(kode, inn.periode.fra, inn.periode.til),
          // Uten denne venter Tripletex priser med mva.
          isPrioritizeAmountsIncludingVat: false,
        }),
      )
      const v = vurder('ny_ordre', r.utfall)
      if (v === 'feilet') {
        return avslutt('feilet', `Tripletex avviste den nye ordren (${statustekst(r.utfall)}). Ingenting er opprettet; prøv igjen.`)
      }
      const ny = v === 'ok' ? tolkNyOrdre(r.json) : null
      if (!ny) {
        return avslutt(
          'ukjent_utfall',
          `Fikk ikke noe sikkert svar fra Tripletex på den nye ordren (${statustekst(r.utfall)}). ` +
            'Den kan være opprettet: sjekk sendingen før timene sendes på nytt.',
        )
      }
      s.ordreId = ny.id
      s.ordrenummer = ny.nummer
      if (!(await flytt(kode, 'startet', { ordre_id: ny.id, ordrenummer: ny.nummer, merke: lagMerke(ny.nummer, kode) }))) {
        throw new Lagringsfeil()
      }
    } else {
      const id = inn.ordre.id
      const r = await prøv(okt, `/order/${id}?fields=id,version,number,isClosed,isPrioritizeAmountsIncludingVat,project(id),internalComment`)
      if (r.utfall === 404) return avslutt('feilet', 'Fant ikke ordren i Tripletex. Ingenting er sendt.', 409)
      if (vurder('hent_ordre', r.utfall) !== 'ok') {
        return avslutt('feilet', `Kunne ikke hente ordren fra Tripletex (${statustekst(r.utfall)}). Ingenting er sendt.`)
      }
      const o = tolkOrdre(r.json)
      if (!o || o.id !== id) return avslutt('feilet', 'Uventet svar fra Tripletex om ordren. Ingenting er sendt.')
      if (o.prosjektId !== prosjekt.id) {
        return avslutt('feilet', `Ordre ${o.nummer} hører ikke til prosjekt ${inn.prosjekt}. Ingenting er sendt.`, 409)
      }
      if (o.lukket !== false) return avslutt('feilet', `Ordre ${o.nummer} er lukket. Ingenting er sendt.`, 409)
      // Prisene sendes eks. mva; på en ordre som prioriterer inkl. mva ville de blitt lest feil.
      if (o.prisInklMva !== false) {
        return avslutt('feilet', 'Ordren bruker priser inkl. mva. Velg en annen ordre eller lag ny.', 409)
      }

      s.ordreId = o.id
      s.ordrenummer = o.nummer
      if (!(await flytt(kode, 'startet', { ordre_id: o.id, ordrenummer: o.nummer, merke: lagMerke(o.nummer, kode) }))) {
        throw new Lagringsfeil()
      }

      // PUT er delvis oppdatering i Tripletex; version gjør at vi ikke skriver over en endring gjort etter GET.
      const k = await prøv(
        okt,
        `/order/${id}`,
        json('PUT', {
          id: o.id,
          version: o.versjon,
          internalComment: medKommentar(o.kommentar, kommentar(kode, inn.periode.fra, inn.periode.til)),
        }),
      )
      if (vurder('kommentar', k.utfall) !== 'ok') {
        return avslutt(
          'feilet',
          k.utfall === 409
            ? `Ordre ${o.nummer} ble endret i Tripletex samtidig. Ingen linjer er lagt på; prøv igjen.`
            : `Kunne ikke skrive sendingskoden på ordre ${o.nummer} (${statustekst(k.utfall)}). Ingen linjer er lagt på; prøv igjen.`,
        )
      }
    }
    const ordreId = s.ordreId as number

    /* 2. Pris og rabatt, fra Tripletex' egen mal så kundepriser og rabatter gjelder */
    const maler = new Map<number, { pris: number; rabatt: number }>()
    for (const l of inn.linjer) {
      if (maler.has(l.produktId)) continue
      const r = await prøv(
        okt,
        `/order/orderline/orderLineTemplate?orderId=${ordreId}&productId=${l.produktId}&fields=unitPriceExcludingVatCurrency,discount`,
      )
      if (vurder('pris', r.utfall) !== 'ok') {
        return avslutt(
          'feilet',
          `Kunne ikke hente prisen for produkt ${l.produktId} fra Tripletex (${statustekst(r.utfall)}). Ingen linjer er lagt på.${tomOrdre()}`,
        )
      }
      const mal = tolkMal(r.json)
      if (mal === null) {
        return avslutt(
          'feilet',
          `Produkt ${l.produktId} har ingen gyldig pris eller rabatt i Tripletex for denne ordren. Rett det der og prøv igjen. ` +
            `Ingen linjer er lagt på.${tomOrdre()}`,
        )
      }
      maler.set(l.produktId, mal)
    }
    const medPris = inn.linjer.map((l) => ({ ...l, ...(maler.get(l.produktId) as { pris: number; rabatt: number }) }))

    /* 3. Linjene, bare om det er tid nok igjen til å vite hvordan det gikk */
    if (forSentForLinjer(start, Date.now())) {
      return avslutt(
        'feilet',
        `Tripletex svarte for sakte, så linjene ble ikke sendt. Ingen linjer er lagt på; prøv igjen.${tomOrdre()}`,
      )
    }
    kanVæreSkrevet = true
    const r = await prøv(
      okt,
      '/order/orderline/list',
      json(
        'POST',
        medPris.map((l) => ({
          order: { id: ordreId },
          product: { id: l.produktId },
          count: l.antall,
          description: l.tekst,
          // Bare dette prisfeltet; Tripletex regner ut det med mva selv, og mva-satsen kommer fra produktet.
          unitPriceExcludingVatCurrency: l.pris,
          discount: l.rabatt,
        })),
      ),
    )
    const v = vurder('linjer', r.utfall)
    if (v === 'feilet') {
      return avslutt(
        'feilet',
        `Tripletex avviste ordrelinjene (${statustekst(r.utfall)}). Ingen linjer er lagt på.${tomOrdre()}`,
      )
    }
    if (v !== 'ok' || !linjeneKomInn(r.json, medPris.length)) {
      return avslutt(
        'ukjent_utfall',
        `Fikk ikke noe sikkert svar fra Tripletex på ordrelinjene (${statustekst(r.utfall)}). ` +
          `De kan være lagt på ordre ${s.ordrenummer}: sjekk sendingen før timene sendes på nytt.`,
      )
    }
    linjer.push(...medPris)

    /* 4. Vedlegget. Feiler det, er ordren likevel riktig, og merket settes. */
    const skjema = new FormData()
    // Kopien gir en ren ArrayBuffer som Blob godtar. Content-Type settes ikke: fetch skriver den med grensen.
    skjema.append('file', new Blob([new Uint8Array(inn.pdf)], { type: 'application/pdf' }), inn.filnavn)
    const vedlegg = await prøv(okt, `/order/${ordreId}/:attach?addToInvoiceMode=NEXT&addToOrderMode=NONE`, {
      method: 'PUT',
      body: skjema,
    })
    const vedleggOk = vurder('vedlegg', vedlegg.utfall) === 'ok'

    /* 5. Merket i SmartDok */
    let merkeOk = true
    try {
      await skrivTilSmartdok(merkesti(lagMerke(s.ordrenummer as string, kode)), inn.timerIder)
    } catch {
      merkeOk = false
    }

    const status = sluttstatus(vedleggOk, merkeOk)
    const meldinger: string[] = []
    if (!vedleggOk) {
      meldinger.push(
        `PDF-en kom ikke sikkert med på ordre ${s.ordrenummer} (${statustekst(vedlegg.utfall)}). ` +
          'Se på ordren i Tripletex og legg den ved for hånd om den mangler.',
      )
    }
    if (!merkeOk) {
      meldinger.push('Timene ble ikke merket i SmartDok. Prøv «Merk» på sendingen igjen før noe annet gjøres med timene.')
    }
    let lagret = false
    try {
      lagret = await flytt(kode, 'startet', { status, antall_linjer: linjer.length })
    } catch {
      // Håndteres under.
    }
    if (!lagret) meldinger.push('Statusen kunne ikke lagres: sendingen sperrer timene til den er avklart.')
    await logget(status)

    return {
      http: 200,
      kropp: {
        status,
        kode,
        ordrenummer: s.ordrenummer,
        ordreId,
        linjer: linjer.map((l) => ({ produktId: l.produktId, antall: l.antall, pris: l.pris, rabatt: l.rabatt })),
        ...(meldinger.length ? { melding: meldinger.join(' ') } : {}),
      },
    }
  } catch {
    // Noe uventet (som oftest databasen). Vi vet ikke sikkert hvor langt vi kom.
    if (kanVæreSkrevet) {
      return avslutt(
        'ukjent_utfall',
        `Sendingen stoppet underveis${s.ordrenummer ? ` (ordre ${s.ordrenummer})` : ''}. ` +
          'Noe kan være lagt inn i Tripletex: sjekk sendingen før timene sendes på nytt.',
      )
    }
    return avslutt('feilet', 'Sendingen stoppet før noe ble lagt på ordren. Prøv igjen.', 500)
  }
}

/* ── Fjern merke ───────────────────────────────────────────── */

export async function fjernMerke(kode: string, bruker: Bruker): Promise<Resultat> {
  let rad: Rad | null
  try {
    rad = await hentRad(kode)
  } catch {
    return feilsvar('Kunne ikke lese sendingen.', 500)
  }
  if (!rad) return feilsvar('Fant ikke sendingen.', 404)

  const status = gjeldendeStatus(rad.status, rad.endret, Date.now())
  if (!tillatt('fjern-merke', status)) {
    return feilsvar(`Sendingen er ${STATUSORD[status]}; merket kan ikke fjernes nå.`, 409)
  }

  let avmerkingFeilet = false
  if (status !== 'sendt_uten_merke') {
    if (!rad.merke) return feilsvar('Sendingen mangler merke. Ingenting er endret.', 409)
    try {
      await skrivTilSmartdok(avmerkesti(rad.merke))
    } catch {
      return feilsvar('SmartDok tok ikke imot. Merket er ikke fjernet; prøv igjen.', 502)
    }
  } else if (rad.merke) {
    // Merkingen feilet, men SmartDok kan ha rukket noen timer før den falt. Merket er unikt
    // for sendingen, så å fjerne det rører ingen andre timer. Feiler det, stopper det ikke.
    try {
      await skrivTilSmartdok(avmerkesti(rad.merke))
    } catch {
      avmerkingFeilet = true
    }
  }

  // Hva som faktisk skjedde i SmartDok, så meldingene under ikke lover mer enn det.
  const iSmartdok =
    status !== 'sendt_uten_merke'
      ? 'Merket er fjernet i SmartDok'
      : avmerkingFeilet
        ? `Merket i SmartDok (sending ${kode}) kunne ikke fjernes`
        : rad.merke
          ? 'Eventuelle merker i SmartDok er fjernet'
          : 'Timene var ikke merket i SmartDok'

  let flyttet: boolean
  try {
    flyttet = await flytt(kode, rad.status, { status: 'angret' }, rad.endret)
  } catch {
    return feilsvar(`${iSmartdok}, men sendingen ${kode} kunne ikke lagres som angret. Prøv igjen.`, 500)
  }
  if (!flyttet) return feilsvar(`${iSmartdok}, men sending ${kode} ble endret samtidig. Last inn på nytt.`, 409)

  await logg('smartdok_pdf.merke_fjernet', {
    utfortAv: bruker.id,
    utfortAvEpost: bruker.epost,
    detaljer: {
      kode,
      prosjekt: rad.prosjekt,
      ordrenummer: rad.ordrenummer,
      status: 'angret',
      fra: rad.status,
      antallLinjer: rad.antall_linjer,
      ...(avmerkingFeilet ? { avmerkingFeilet: true } : {}),
    },
  })

  return {
    http: 200,
    kropp: {
      status: 'angret',
      kode,
      ordrenummer: rad.ordrenummer,
      melding:
        (avmerkingFeilet
          ? `Sending ${kode} er angret i listen vår, men merket i SmartDok kunne ikke fjernes: ` +
            `se etter timer merket «${rad.merke}» der og fjern merket for hånd. `
          : `${iSmartdok}. `) +
        `Ordre ${rad.ordrenummer ?? ''} i Tripletex er ikke endret: fjern linjene der for hånd om ordren skal rettes.`,
    },
  }
}

/* ── Avklar ────────────────────────────────────────────────── */

type Funn = { funnet: boolean; ordreId: number | null; ordrenummer: string | null; antallLinjer: number }

const ikkeFunnet: Funn = { funnet: false, ordreId: null, ordrenummer: null, antallLinjer: 0 }

/** Leter etter ordren med sendingens kode i den interne kommentaren. */
async function finnOrdre(rad: Rad): Promise<Funn | Resultat> {
  let okt: Tripletexøkt
  try {
    okt = await apneTripletex()
  } catch (e) {
    return feilsvar(e instanceof Error ? e.message : 'Fikk ikke kontakt med Tripletex.', 502)
  }

  if (rad.ordre_id !== null) {
    const r = await prøv(okt, `/order/${rad.ordre_id}?fields=id,version,number,internalComment,orderLines(id)`)
    if (r.utfall === 404) return ikkeFunnet
    if (!ok(r.utfall)) return feilsvar(`Kunne ikke hente ordren fra Tripletex (${statustekst(r.utfall)}).`, 502)
    const o = tolkOrdre(r.json)
    if (!o) return feilsvar('Uventet svar fra Tripletex om ordren.', 502)
    return harKode(o.kommentar, rad.kode)
      ? { funnet: true, ordreId: o.id, ordrenummer: o.nummer, antallLinjer: o.antallLinjer }
      : ikkeFunnet
  }

  // Ordre-id-en kom aldri tilbake: let blant kundens ordrer fra den dagen. Ordredatoen
  // settes rett etter at raden er skrevet, og kan ha krysset midnatt; orderDateTo er eksklusiv.
  const prosjekt = await finnProsjekt(okt, rad.prosjekt)
  if ('http' in prosjekt) return prosjekt
  const dag = isoDato(Date.parse(rad.opprettet))
  let svar
  try {
    svar = await hentAlleSider(
      okt,
      `/order?customerId=${prosjekt.kundeId}&orderDateFrom=${dag}&orderDateTo=${leggTilDager(dag, 2)}` +
        '&fields=id,number,internalComment,orderLines(id)',
    )
  } catch {
    return feilsvar('Uventet svar fra Tripletex på ordrelista.', 502)
  }
  if ('status' in svar) return feilsvar(`Kunne ikke hente ordrer fra Tripletex (status ${svar.status}).`, 502)
  const treff = ordrerMedKode(svar.json.values, rad.kode)
  if (treff.length > 1) return feilsvar(`Flere ordrer i Tripletex har koden ${rad.kode}. Se på dem der.`, 409)
  if (treff.length === 0) return ikkeFunnet
  const t = treff[0]
  return { funnet: true, ordreId: t.id, ordrenummer: t.nummer, antallLinjer: t.antallLinjer }
}

export async function avklar(kode: string, valg: Avklaring, bruker: Bruker): Promise<Resultat> {
  let rad: Rad | null
  try {
    rad = await hentRad(kode)
  } catch {
    return feilsvar('Kunne ikke lese sendingen.', 500)
  }
  if (!rad) return feilsvar('Fant ikke sendingen.', 404)

  const status = gjeldendeStatus(rad.status, rad.endret, Date.now())
  if (!tillatt(valg, status)) return feilsvar(`Sendingen er ${STATUSORD[status]}; det valget gjelder ikke nå.`, 409)

  const loggAvklar = (ny: Sendestatus, ordrenummer: string | null, antallLinjer: number | null) =>
    logg('smartdok_pdf.sending_avklart', {
      utfortAv: bruker.id,
      utfortAvEpost: bruker.epost,
      detaljer: { kode, prosjekt: rad.prosjekt, valg, fra: rad.status, status: ny, ordrenummer, antallLinjer },
    })

  try {
    if (valg === 'sjekk') {
      const f = await finnOrdre(rad)
      if ('http' in f) return f
      /*
       * En foreldet «startet» flyttes til ukjent_utfall i samme skriving. Ellers
       * ville skrivingen fornyet `endret`, og raden sett ut som en sending som
       * pågår i ti minutter til.
       */
      const foreldet = rad.status === 'startet'
      const husk = f.funnet && rad.ordre_id === null
      // Statusen vi svarer med, er den som faktisk står lagret etterpå.
      let lagret: Sendestatus = status
      if (foreldet || husk) {
        const flyttet = await flytt(
          kode,
          rad.status,
          {
            ...(foreldet ? { status: 'ukjent_utfall' } : {}),
            ...(husk ? { ordre_id: f.ordreId, ordrenummer: f.ordrenummer } : {}),
          },
          rad.endret,
        )
        if (flyttet) {
          lagret = foreldet ? 'ukjent_utfall' : rad.status
        } else {
          // Noen andre rakk å endre sendingen mens vi lette: les den på nytt.
          const nå = await hentRad(kode)
          lagret = nå ? gjeldendeStatus(nå.status, nå.endret, Date.now()) : status
        }
      }
      await loggAvklar(lagret, f.ordrenummer, f.antallLinjer)
      return {
        http: 200,
        kropp: {
          funnet: f.funnet,
          nyOrdre: rad.ny_ordre === true,
          ordrenummer: f.ordrenummer,
          antallLinjer: f.antallLinjer,
          status: lagret,
        },
      }
    }

    if (valg === 'frigi') {
      if (!(await flytt(kode, rad.status, { status: 'angret' }, rad.endret))) {
        return feilsvar('Sendingen ble endret samtidig. Last inn på nytt.', 409)
      }
      await loggAvklar('angret', rad.ordrenummer, rad.antall_linjer)
      return {
        http: 200,
        kropp: {
          status: 'angret',
          kode,
          ordrenummer: rad.ordrenummer,
          melding: 'Timene er frigitt og kan sendes på nytt. Se på ordren i Tripletex først, så de ikke faktureres to ganger.',
        },
      }
    }

    // merk: etter ukjent utfall bare på en ordre sendingen selv laget, og som har linjer.
    let ordreId = rad.ordre_id
    let ordrenummer = rad.ordrenummer
    if (status === 'ukjent_utfall') {
      const f = await finnOrdre(rad)
      if ('http' in f) return f
      const nei = kanMerke(status, rad.ny_ordre, f)
      if (nei) return feilsvar(nei, 409)
      ordreId = f.ordreId
      ordrenummer = f.ordrenummer
    } else {
      const nei = kanMerke(status, rad.ny_ordre, null)
      if (nei) return feilsvar(nei, 409)
    }
    if (!ordrenummer) return feilsvar('Sendingen mangler ordrenummer. Ingenting er endret.', 409)
    const merke = rad.merke ?? lagMerke(ordrenummer, kode)

    try {
      await skrivTilSmartdok(merkesti(merke), rad.timer_ider)
    } catch {
      // Ordren er funnet, så det som gjenstår, er bare merket.
      if (status === 'ukjent_utfall') {
        await flytt(kode, rad.status, { status: 'sendt_uten_merke', ordre_id: ordreId, ordrenummer, merke }, rad.endret)
        await loggAvklar('sendt_uten_merke', ordrenummer, null)
      }
      return feilsvar('SmartDok tok ikke imot merket. Prøv igjen.', 502)
    }

    if (!(await flytt(kode, rad.status, { status: 'sendt', ordre_id: ordreId, ordrenummer, merke }, rad.endret))) {
      return feilsvar('Sendingen ble endret samtidig. Last inn på nytt.', 409)
    }
    await loggAvklar('sendt', ordrenummer, null)
    return { http: 200, kropp: { status: 'sendt', kode, ordrenummer, melding: `Timene er merket med ordre ${ordrenummer} i SmartDok.` } }
  } catch {
    return feilsvar('Kunne ikke lagre sendingen. Prøv igjen.', 500)
  }
}

import { logg } from '@/lib/data'
import { isoDato, leggTilDager } from '@/lib/format'
import { skrivTilSmartdok } from '@/lib/prosjekter/smartdok'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { lagKode, lagMerke, overlapp, tolkProsjekt } from '@/lib/smartdok-pdf/ordre'
import {
  gjeldendeStatus,
  harKode,
  kommentar,
  linjeneKomInn,
  medKommentar,
  ordrerMedKode,
  sluttstatus,
  sumEksMva,
  tillatt,
  tolkNyOrdre,
  tolkOrdre,
  tolkPris,
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

type Rad = {
  kode: string
  prosjekt: string
  ordre_id: number | null
  ordrenummer: string | null
  merke: string | null
  timer_ider: number[]
  status: Sendestatus
  antall_linjer: number | null
  opprettet: string
  endret: string
}

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
    .select('kode, prosjekt, ordre_id, ordrenummer, merke, timer_ider, status, antall_linjer, opprettet, endret')
    .eq('kode', kode)
    .maybeSingle()
  if (error) throw new Lagringsfeil()
  return (data as Rad | null) ?? null
}

/** Sendinger som fortsatt holder på noen av timene. `førId` gir bare de som kom før vår egen rad. */
async function hentAktive(timerIder: number[], førId?: number) {
  let q = supabaseAdmin
    .from(TABELL)
    .select('kode, ordrenummer, timer_ider')
    .overlaps('timer_ider', timerIder)
    .not('status', 'in', '(angret,feilet)')
  if (førId !== undefined) q = q.lt('id', førId)
  const { data, error } = await q
  if (error) throw new Lagringsfeil()
  return (data ?? []) as { kode: string; ordrenummer: string | null; timer_ider: number[] }[]
}

function alleredeSendt(treff: { kode: string; ordrenummer: string | null }): Resultat {
  return feilsvar(
    `Timene er alt sendt til ordre ${treff.ordrenummer ?? '(ikke avklart)'} (sending ${treff.kode}). ` +
      'Fjern merket eller avklar den sendingen før timene sendes på nytt.',
    409,
  )
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
  let radId: number | null = null
  try {
    const treff = overlapp(inn.timerIder, await hentAktive(inn.timerIder))
    if (treff) return alleredeSendt(treff)

    for (let forsøk = 0; forsøk < 3 && radId === null; forsøk++) {
      kode = lagKode()
      const { data, error } = await supabaseAdmin
        .from(TABELL)
        .insert({ kode, prosjekt: inn.prosjekt, timer_ider: inn.timerIder, status: 'startet', opprettet_av: bruker.id })
        .select('id')
        .single()
      if (!error) radId = (data as { id: number }).id
      // 23505: koden fantes fra før. Alt annet er en feil vi ikke skal prøve oss forbi.
      else if (error.code !== '23505') throw new Lagringsfeil()
    }
    if (radId === null) throw new Lagringsfeil()

    // To samtidige sendinger kan begge ha passert sjekken over. Den som fikk lavest id, vinner.
    const før = overlapp(inn.timerIder, await hentAktive(inn.timerIder, radId))
    if (før) {
      await flytt(kode, 'startet', { status: 'feilet' })
      return alleredeSendt(før)
    }
  } catch {
    if (radId !== null) await flytt(kode, 'startet', { status: 'feilet' }).catch(() => false)
    return feilsvar('Kunne ikke lagre sendingen. Ingenting er sendt til Tripletex.', 500)
  }

  const s = { ordreId: null as number | null, ordrenummer: null as string | null, ny: 'ny' in inn.ordre }
  // Satt når Tripletex kan ha fått noe som faktureres: en ny ordre eller linjer.
  let kanVæreSkrevet = false
  const linjer: { produktId: number; antall: number; pris: number; tekst: string }[] = []

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
      const r = await prøv(okt, `/order/${id}?fields=id,version,number,isClosed,project(id),internalComment`)
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

      s.ordreId = o.id
      s.ordrenummer = o.nummer
      if (!(await flytt(kode, 'startet', { ordre_id: o.id, ordrenummer: o.nummer, merke: lagMerke(o.nummer, kode) }))) {
        throw new Lagringsfeil()
      }

      // PUT er delvis oppdatering i Tripletex; version gjør at vi ikke skriver over en endring gjort etter GET.
      const k = await prøv(
        okt,
        `/order/${id}`,
        json('PUT', { id: o.id, version: o.versjon, internalComment: medKommentar(o.kommentar, kommentar(kode, inn.periode.fra, inn.periode.til)) }),
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

    /* 2. Prisene, fra Tripletex' egen mal så kundepriser og rabatter gjelder */
    const priser = new Map<number, number>()
    for (const l of inn.linjer) {
      if (priser.has(l.produktId)) continue
      const r = await prøv(
        okt,
        `/order/orderline/orderLineTemplate?orderId=${ordreId}&productId=${l.produktId}&fields=unitPriceExcludingVatCurrency`,
      )
      if (vurder('pris', r.utfall) !== 'ok') {
        return avslutt(
          'feilet',
          `Kunne ikke hente prisen for produkt ${l.produktId} fra Tripletex (${statustekst(r.utfall)}). Ingen linjer er lagt på.${tomOrdre()}`,
        )
      }
      const pris = tolkPris(r.json)
      if (pris === null) {
        return avslutt(
          'feilet',
          `Produkt ${l.produktId} har ingen pris i Tripletex for denne ordren. Legg inn prisen der og prøv igjen. ` +
            `Ingen linjer er lagt på.${tomOrdre()}`,
        )
      }
      priser.set(l.produktId, pris)
    }
    const medPris = inn.linjer.map((l) => ({ ...l, pris: priser.get(l.produktId) as number }))

    /* 3. Linjene */
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
    const merke = lagMerke(s.ordrenummer as string, kode)
    let merkeOk = true
    try {
      await skrivTilSmartdok(
        `/WorkHours/SetExportedExternal?exportedExternalId=${encodeURIComponent(merke)}&setAsExportedExternal=true`,
        inn.timerIder,
      )
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
        linjer: linjer.map((l) => ({ produktId: l.produktId, antall: l.antall, pris: l.pris })),
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

  // Uten merke i SmartDok er det ingenting å fjerne der.
  if (status !== 'sendt_uten_merke') {
    if (!rad.merke) return feilsvar('Sendingen mangler merke. Ingenting er endret.', 409)
    try {
      await skrivTilSmartdok(`/WorkHours/UnmarkExportedExternal?exportedExternalId=${encodeURIComponent(rad.merke)}`)
    } catch {
      return feilsvar('SmartDok tok ikke imot. Merket er ikke fjernet; prøv igjen.', 502)
    }
  }

  let flyttet: boolean
  try {
    flyttet = await flytt(kode, rad.status, { status: 'angret' }, rad.endret)
  } catch {
    return feilsvar('Merket er fjernet i SmartDok, men sendingen kunne ikke lagres som angret. Prøv igjen.', 500)
  }
  if (!flyttet) return feilsvar('Sendingen ble endret samtidig. Last inn på nytt.', 409)

  await logg('smartdok_pdf.merke_fjernet', {
    utfortAv: bruker.id,
    utfortAvEpost: bruker.epost,
    detaljer: { kode, prosjekt: rad.prosjekt, ordrenummer: rad.ordrenummer, status: 'angret', fra: rad.status, antallLinjer: rad.antall_linjer },
  })

  return {
    http: 200,
    kropp: {
      status: 'angret',
      kode,
      ordrenummer: rad.ordrenummer,
      melding:
        `Merket er fjernet i SmartDok. Ordre ${rad.ordrenummer ?? ''} i Tripletex er ikke endret: ` +
        'fjern linjene der for hånd om ordren skal rettes.',
    },
  }
}

/* ── Avklar ────────────────────────────────────────────────── */

type Funn = { funnet: boolean; ordreId: number | null; ordrenummer: string | null; antallLinjer: number }

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
    if (r.utfall === 404) return { funnet: false, ordreId: null, ordrenummer: null, antallLinjer: 0 }
    if (!ok(r.utfall)) return feilsvar(`Kunne ikke hente ordren fra Tripletex (${statustekst(r.utfall)}).`, 502)
    const o = tolkOrdre(r.json)
    if (!o) return feilsvar('Uventet svar fra Tripletex om ordren.', 502)
    return harKode(o.kommentar, rad.kode)
      ? { funnet: true, ordreId: o.id, ordrenummer: o.nummer, antallLinjer: o.antallLinjer }
      : { funnet: false, ordreId: null, ordrenummer: null, antallLinjer: 0 }
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
  if (treff.length === 0) return { funnet: false, ordreId: null, ordrenummer: null, antallLinjer: 0 }
  return { funnet: true, ordreId: treff[0].id, ordrenummer: treff[0].nummer, antallLinjer: treff[0].antallLinjer }
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
      // Huskes, så neste sjekk og «merk» går rett på ordren.
      if (f.funnet && rad.ordre_id === null) {
        await flytt(kode, rad.status, { ordre_id: f.ordreId, ordrenummer: f.ordrenummer }, rad.endret)
      }
      await loggAvklar(rad.status, f.ordrenummer, f.antallLinjer)
      return { http: 200, kropp: { funnet: f.funnet, ordrenummer: f.ordrenummer, antallLinjer: f.antallLinjer, status } }
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

    // merk: bare når vi vet hvilken ordre timene ligger på, og at den har linjer.
    let ordreId = rad.ordre_id
    let ordrenummer = rad.ordrenummer
    if (status === 'ukjent_utfall') {
      const f = await finnOrdre(rad)
      if ('http' in f) return f
      if (!f.funnet) return feilsvar('Fant ingen ordre med sendingens kode i Tripletex. Timene merkes ikke; frigi sendingen i stedet.', 409)
      if (f.antallLinjer === 0) {
        return feilsvar(`Ordre ${f.ordrenummer} har ingen linjer. Timene merkes ikke; frigi sendingen i stedet.`, 409)
      }
      ordreId = f.ordreId
      ordrenummer = f.ordrenummer
    }
    if (!ordrenummer) return feilsvar('Sendingen mangler ordrenummer. Ingenting er endret.', 409)
    const merke = rad.merke ?? lagMerke(ordrenummer, kode)

    try {
      await skrivTilSmartdok(
        `/WorkHours/SetExportedExternal?exportedExternalId=${encodeURIComponent(merke)}&setAsExportedExternal=true`,
        rad.timer_ider,
      )
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

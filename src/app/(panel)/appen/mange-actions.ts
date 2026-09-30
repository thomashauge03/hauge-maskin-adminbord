'use server'

import { z } from 'zod'
import { krevEier } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { loggMange } from '@/lib/data'
import { iBiter, medHøyst } from '@/lib/samtidig'
import { oppdaterAppen, type Tilstand } from './tilstand'

/*
 * Handlinger på mange personer om gangen. Én handling er ett kall med alle
 * id-ene, ikke ett per person.
 *
 * 500 er en sikring, ikke en forventning. 200 brukere får plass med god
 * margin, og et skjema som sender ti tusen id-er er ikke noe vi skal prøve å
 * gjennomføre.
 */
const MAKS = 500
const iderSkjema = z
  .array(z.string().uuid())
  .min(1, 'Velg minst én.')
  .max(MAKS, `Høyst ${MAKS} om gangen.`)
  // Uten dette kan samme person havne i to biter, og bli talt og loggført to ganger.
  .transform((liste) => [...new Set(liste)])
const gruppeSkjema = z.string().uuid('Velg en gruppe.')

/*
 * Hundre id-er i et filter er rundt 4 KB i adressen, halvparten av det mange
 * porter slipper gjennom – se iBiter. Selv `MAKS` blir bare fem kall.
 */
const BIT = 100

type Person = { id: string; navn: string; epost: string; nav_bruker_id: string }

/**
 * Spør bit for bit, etter hverandre, og samler radene.
 *
 * Stopper ved første feil, men gir fra seg det som gikk gjennom før den:
 * `ferdige` er elementene i bitene som lyktes. En skriving som stopper midt i
 * har endret noe på ekte, og skjermen og loggen må få vite det.
 */
async function perBit<T, R>(
  liste: readonly T[],
  spør: (bit: T[]) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>,
): Promise<{ ferdige: T[]; rader: R[]; feil: string | null }> {
  const ferdige: T[] = []
  const rader: R[] = []
  for (const bit of iBiter(liste, BIT)) {
    const { data, error } = await spør(bit)
    // Kallerne spør om `feil` er satt. En feil med tom melding skal ikke se ut
    // som at alt gikk bra.
    if (error) return { ferdige, rader, feil: error.message || 'ukjent feil' }
    ferdige.push(...bit)
    rader.push(...(data ?? []))
  }
  return { ferdige, rader, feil: null }
}

async function finnGruppe(id: string): Promise<{ gruppe: { id: string; navn: string } } | { feil: string }> {
  const { data, error } = await supabaseAdmin.from('grupper').select('id, navn').eq('id', id).maybeSingle()
  if (error) return { feil: `Kunne ikke lese gruppa: ${error.message}` }
  if (!data) return { feil: 'Gruppa finnes ikke lenger. Last siden på nytt.' }
  return { gruppe: { id: data.id as string, navn: data.navn as string } }
}

/**
 * Slipper de valgte inn, eventuelt rett i en gruppe.
 *
 * Gjelder bare dem som ikke allerede er godkjent – også gruppa. Skal
 * godkjente inn i en gruppe, er det «Legg i gruppe».
 */
export async function godkjennMange(_forrige: Tilstand, data: FormData): Promise<Tilstand> {
  const meg = await krevEier()

  const ider = iderSkjema.safeParse(data.getAll('id'))
  if (!ider.success) return { feil: ider.error.issues[0].message }

  let gruppe: { id: string; navn: string } | null = null
  const ønsket = String(data.get('gruppe') ?? '')
  if (ønsket) {
    const gyldig = gruppeSkjema.safeParse(ønsket)
    if (!gyldig.success) return { feil: gyldig.error.issues[0].message }
    const funnet = await finnGruppe(gyldig.data)
    if ('feil' in funnet) return { feil: funnet.feil }
    gruppe = funnet.gruppe
  }

  const lest = await perBit(ider.data, (bit) =>
    supabaseAdmin
      .from('personer')
      .select('id, navn, epost, nav_bruker_id')
      .in('id', bit)
      .neq('status', 'godkjent')
      .not('nav_bruker_id', 'is', null),
  )
  if (lest.feil) return { feil: `Kunne ikke lese de valgte: ${lest.feil}` }

  const personer = lest.rader as Person[]
  if (personer.length === 0) return { ok: 'Alle de valgte var allerede godkjent.' }

  /*
   * E-posten bekreftes per person før statusen settes, som i settAppstatus –
   * se begrunnelsen der. Den som ikke fikk bekreftet e-posten, blir ikke
   * godkjent.
   *
   * Utfallet avgjøres av om kallet ga en feil, aldri av teksten i den: en feil
   * uten melding skal ikke kunne slippe noen inn uten bekreftet e-post.
   */
  const bekreftet = await medHøyst(8, personer, async (p) => {
    const { error: feil } = await supabaseAdmin.auth.admin.updateUserById(p.nav_bruker_id, {
      email_confirm: true,
    })
    return { p, ok: !feil, grunn: feil?.message || 'ukjent feil' }
  })
  const klare = bekreftet.filter((b) => b.ok).map((b) => b.p)
  const feilet = bekreftet.filter((b) => !b.ok)

  // Grunnen går til tjenerloggen, uten adressene: svaret på skjermen navngir
  // dem, og persondata hører ikke hjemme i en logg som ligger hos Vercel.
  if (feilet.length > 0) {
    console.error(
      `Kunne ikke bekrefte e-posten til ${feilet.length} av ${personer.length}: ${[
        ...new Set(feilet.map((f) => f.grunn)),
      ].join('; ')}`,
    )
  }

  /*
   * Navnene på dem som falt ut følger med ALLE svar herfra og ned, også
   * feilsvarene. Svaret skal navngi dem som feilet, og et svar som stopper
   * tidlig ville ellers latt dem forsvinne stille.
   */
  const ikkeBekreftet =
    feilet.length > 0
      ? `Fikk ikke bekreftet e-posten til ${feilet.map((f) => f.p.epost).join(', ')}, så de er ikke godkjent.`
      : ''
  const medIkkeBekreftet = (tekst: string) => (ikkeBekreftet ? `${tekst}. ${ikkeBekreftet}` : tekst)

  const godkjenning = { status: 'godkjent', godkjent_av: meg.id, godkjent_tid: new Date().toISOString() }
  const skrevet = await perBit(klare, (bit) =>
    supabaseAdmin
      .from('personer')
      .update(godkjenning)
      .in(
        'id',
        bit.map((p) => p.id),
      ),
  )
  const godkjente = skrevet.ferdige
  const stoppet = skrevet.feil
  if (stoppet && godkjente.length === 0) {
    return { feil: medIkkeBekreftet(`Kunne ikke godkjenne: ${stoppet}`) }
  }

  /*
   * Stoppet det midt i, er bitene før feilen godkjent på ekte. De logges og
   * legges i gruppa som om alt gikk, ellers står de godkjent uten gruppe, og
   * «Godkjenn» på nytt tar bare dem som er igjen.
   */
  if (godkjente.length > 0) {
    await loggMange(
      'appkonto.godkjent',
      meg,
      godkjente.map((p) => ({ personId: p.id, epost: p.epost })),
    )

    if (gruppe) {
      const { id: gruppeId, navn: gruppeNavn } = gruppe
      const { data: satt, error: gruppeFeil } = await supabaseAdmin
        .from('person_gruppe')
        .upsert(
          godkjente.map((p) => ({ person_id: p.id, gruppe_id: gruppeId })),
          { onConflict: 'person_id,gruppe_id', ignoreDuplicates: true },
        )
        .select('person_id')
      if (gruppeFeil) {
        oppdaterAppen()
        return {
          feil: medIkkeBekreftet(
            `${godkjente.length} godkjent, men ikke lagt i ${gruppeNavn}: ${gruppeFeil.message}` +
              (stoppet ? `. Resten ble heller ikke godkjent: ${stoppet}` : ''),
          ),
        }
      }
      // Svaret har bare radene som ble satt inn. Den som alt lå i gruppa – de kan
      // settes opp før godkjenningen – skal ikke få en ny «lagt i gruppe» i
      // historikken.
      const nye = new Set((satt ?? []).map((r) => r.person_id as string))
      await loggMange(
        'gruppe.person_inn',
        meg,
        godkjente
          .filter((p) => nye.has(p.id))
          .map((p) => ({ personId: p.id, person: p.navn, gruppe: gruppeNavn })),
      )
    }
  }

  oppdaterAppen()
  if (stoppet) {
    return {
      feil: medIkkeBekreftet(
        `${godkjente.length} godkjent${gruppe ? ` og lagt i ${gruppe.navn}` : ''} før det stoppet: ${stoppet}`,
      ),
    }
  }
  return {
    ok:
      godkjente.length > 0
        ? `${godkjente.length} godkjent${gruppe ? ` og lagt i ${gruppe.navn}` : ' – de ser ingenting før de er i en gruppe'}.`
        : undefined,
    feil: ikkeBekreftet || undefined,
  }
}

/** Legger de valgte i en gruppe (inn = true), eller tar dem ut. */
export async function settGruppeForMange(
  inn: boolean,
  _forrige: Tilstand,
  data: FormData,
): Promise<Tilstand> {
  const meg = await krevEier()

  const ider = iderSkjema.safeParse(data.getAll('id'))
  if (!ider.success) return { feil: ider.error.issues[0].message }
  const gyldig = gruppeSkjema.safeParse(data.get('gruppe'))
  if (!gyldig.success) return { feil: gyldig.error.issues[0].message }

  const funnet = await finnGruppe(gyldig.data)
  if ('feil' in funnet) return { feil: funnet.feil }
  const { gruppe } = funnet

  const lest = await perBit(ider.data, (bit) =>
    supabaseAdmin
      .from('personer')
      .select('id, navn')
      .in('id', bit)
      .not('nav_bruker_id', 'is', null),
  )
  if (lest.feil) return { feil: `Kunne ikke lese de valgte: ${lest.feil}` }
  const personer = lest.rader as { id: string; navn: string }[]
  if (personer.length === 0) {
    return { feil: 'Ingen av de valgte har konto i appen lenger. Last siden på nytt.' }
  }

  // Svaret sier hvilke rader som faktisk ble endret. Da blir tallet og
  // loggen riktige også for dem som alt var der – eller aldri var det.
  let endret: { person_id: string }[]
  let feil: string | null
  if (inn) {
    const { data: satt, error } = await supabaseAdmin
      .from('person_gruppe')
      .upsert(
        personer.map((p) => ({ person_id: p.id, gruppe_id: gruppe.id })),
        { onConflict: 'person_id,gruppe_id', ignoreDuplicates: true },
      )
      .select('person_id')
    endret = satt ?? []
    feil = error ? error.message || 'ukjent feil' : null
  } else {
    const ut = await perBit(personer, (bit) =>
      supabaseAdmin
        .from('person_gruppe')
        .delete()
        .eq('gruppe_id', gruppe.id)
        .in(
          'person_id',
          bit.map((p) => p.id),
        )
        .select('person_id'),
    )
    endret = ut.rader
    feil = ut.feil
  }

  const berørte = new Set(endret.map((r) => r.person_id))
  await loggMange(
    inn ? 'gruppe.person_inn' : 'gruppe.person_ut',
    meg,
    personer
      .filter((p) => berørte.has(p.id))
      .map((p) => ({ personId: p.id, person: p.navn, gruppe: gruppe.navn })),
  )

  if (feil) {
    // Har bitene før feilen endret noe, er det endret på ekte.
    if (berørte.size === 0) return { feil: `Kunne ikke endre: ${feil}` }
    oppdaterAppen()
    return { feil: `${berørte.size} ${inn ? 'lagt i' : 'tatt ut av'} ${gruppe.navn} før det stoppet: ${feil}` }
  }

  oppdaterAppen()
  const uendret = personer.length - berørte.size
  return {
    ok:
      `${berørte.size} ${inn ? 'lagt i' : 'tatt ut av'} ${gruppe.navn}` +
      (uendret > 0 ? ` (${uendret} ${inn ? 'var der fra før' : 'var ikke i gruppa'}).` : '.'),
  }
}

/**
 * Stenger de valgte ute. De beholder gruppene, så «Slipp inn igjen» gir dem
 * det samme tilbake.
 */
export async function stengUteMange(_forrige: Tilstand, data: FormData): Promise<Tilstand> {
  const meg = await krevEier()

  const ider = iderSkjema.safeParse(data.getAll('id'))
  if (!ider.success) return { feil: ider.error.issues[0].message }

  const stengt = await perBit(ider.data, (bit) =>
    supabaseAdmin
      .from('personer')
      .update({ status: 'sperra' })
      .in('id', bit)
      .neq('status', 'sperra')
      .not('nav_bruker_id', 'is', null)
      .select('id, epost'),
  )
  const stengte = stengt.rader as { id: string; epost: string }[]
  if (stengte.length === 0 && stengt.feil) return { feil: `Kunne ikke stenge ute: ${stengt.feil}` }
  if (stengte.length === 0) return { ok: 'Alle de valgte var allerede stengt ute.' }

  await loggMange(
    'appkonto.sperra',
    meg,
    stengte.map((p) => ({ personId: p.id, epost: p.epost })),
  )

  oppdaterAppen()
  if (stengt.feil) return { feil: `${stengte.length} stengt ute før det stoppet: ${stengt.feil}` }
  return {
    ok: `${stengte.length} stengt ute. De beholder gruppene, så «Slipp inn igjen» gir dem det samme tilbake.`,
  }
}

import { lagServerKlient } from '@/lib/supabase/server'
import { alleRader } from '@/lib/supabase/alle-rader'
import { isoDato, ukestart } from '@/lib/format'
import 'server-only'

/** Det som skrives inn og kan endres. Resten av raden settes av systemet. */
export type Gjøremålsfelter = {
  tittel: string
  notat: string | null
  /** ÅÅÅÅ-MM-DD, eller null for uten frist. */
  frist: string | null
  viktig: boolean
  systemId: string | null
}

export type Gjøremål = Gjøremålsfelter & {
  id: string
  gjort: string | null
  /** Når oppfølgingen startet, eller null. Slås av og på for seg, som `gjort`. */
  oppfølgingSiden: string | null
  opprettet: string
}

/** Et system man kan knytte et gjøremål til. Bare det lista trenger. */
export type Systemvalg = { id: string; navn: string }

type GjøremålRad = {
  id: string
  tittel: string
  notat: string | null
  frist: string | null
  viktig: boolean
  system_id: string | null
  gjort: string | null
  under_oppfolging_siden: string | null
  opprettet: string
}

const KOLONNER = 'id, tittel, notat, frist, viktig, system_id, gjort, under_oppfolging_siden, opprettet'

function fraRad(r: GjøremålRad): Gjøremål {
  return {
    id: r.id,
    tittel: r.tittel,
    notat: r.notat,
    frist: r.frist,
    viktig: r.viktig,
    systemId: r.system_id,
    gjort: r.gjort,
    oppfølgingSiden: r.under_oppfolging_siden,
    opprettet: r.opprettet,
  }
}

/**
 * Henter alle den innloggedes gjøremål, åpne og gjorte, og systemene de kan
 * knyttes til.
 *
 * Alle gjorte, ikke bare de siste: lista er en logg over hva som er gjort,
 * og skal vare. Før ble bare de hundre siste hentet, og det eldste forsvant
 * stille. Gjennom alleRader, fordi PostgREST kapper ved tusen uten å si fra.
 *
 * Med sesjonsklienten, ikke service role: radsikkerheten er det som holder
 * listene adskilt, og service role ville gått rett forbi den. Derfor heller
 * ingen eier-filter her – det ville bare skjult en feil i policyen.
 */
export async function hentGjøremål(): Promise<{
  liste: Gjøremål[]
  systemer: Systemvalg[]
  idag: string
  mandag: string
}> {
  const supabase = await lagServerKlient()

  const [rader, systemer] = await Promise.all([
    alleRader('gjøremål', (fra, til) =>
      supabase
        .from('gjoremal')
        .select(KOLONNER)
        // Unik nøkkel sist, ellers kan en rad komme med to ganger eller
        // falle ut mellom to sider.
        .order('opprettet', { ascending: false })
        .order('id')
        .range(fra, til),
    ),
    // Også inaktive: et gjøremål kan gjelde et system som er satt på pause,
    // og navnet skal vises på det.
    supabase.from('systemer').select('id, navn, aktiv').order('sortering').order('navn'),
  ])

  if (systemer.error) throw new Error(`Kunne ikke hente systemene: ${systemer.error.message}`)

  const naa = Date.now()
  return {
    liste: (rader as GjøremålRad[]).map(fraRad),
    systemer: (systemer.data ?? []).map((s) => ({ id: s.id as string, navn: s.navn as string })),
    // Her og ikke i lista: klokka leses én gang, på serveren, så server og
    // nettleser er enige om hvilken dag og uke det er når siden hydreres.
    idag: isoDato(naa),
    mandag: ukestart(naa),
  }
}

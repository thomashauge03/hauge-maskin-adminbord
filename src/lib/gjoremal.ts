import { lagServerKlient } from '@/lib/supabase/server'
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

/** Hvor mange avhukede som hentes. Åpne hentes alltid alle. */
const GJORT_GRENSE = 100

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
 * Henter den innloggedes gjøremål: alle åpne og de siste avhukede, og
 * systemene de kan knyttes til.
 *
 * Med sesjonsklienten, ikke service role: radsikkerheten er det som holder
 * listene adskilt, og service role ville gått rett forbi den. Derfor heller
 * ingen eier-filter her – det ville bare skjult en feil i policyen.
 */
export async function hentGjøremål(): Promise<{
  liste: Gjøremål[]
  systemer: Systemvalg[]
  gjortAvkortet: boolean
  idag: string
  mandag: string
}> {
  const supabase = await lagServerKlient()

  const [åpne, gjort, systemer] = await Promise.all([
    supabase.from('gjoremal').select(KOLONNER).is('gjort', null),
    supabase
      .from('gjoremal')
      .select(KOLONNER)
      .not('gjort', 'is', null)
      .order('gjort', { ascending: false })
      .limit(GJORT_GRENSE),
    // Også inaktive: et gjøremål kan gjelde et system som er satt på pause,
    // og navnet skal vises på det.
    supabase.from('systemer').select('id, navn, aktiv').order('sortering').order('navn'),
  ])

  const feil = åpne.error ?? gjort.error ?? systemer.error
  if (feil) throw new Error(`Kunne ikke hente gjøremål: ${feil.message}`)

  const naa = Date.now()
  return {
    liste: [...(åpne.data ?? []), ...(gjort.data ?? [])].map((r) => fraRad(r as GjøremålRad)),
    systemer: (systemer.data ?? []).map((s) => ({ id: s.id as string, navn: s.navn as string })),
    gjortAvkortet: (gjort.data?.length ?? 0) >= GJORT_GRENSE,
    // Her og ikke i lista: klokka leses én gang, på serveren, så server og
    // nettleser er enige om hvilken dag og uke det er når siden hydreres.
    idag: isoDato(naa),
    mandag: ukestart(naa),
  }
}

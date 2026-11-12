import { lagServerKlient } from '@/lib/supabase/server'
import 'server-only'

export type Gjøremål = {
  id: string
  tittel: string
  notat: string | null
  gjort: string | null
  opprettet: string
}

/** Hvor mange avhukede som vises. Åpne vises alltid alle. */
export const GJORT_GRENSE = 100

/**
 * Henter den innloggedes gjøremål.
 *
 * Med sesjonsklienten, ikke service role: radsikkerheten er det som holder
 * listene adskilt, og service role ville gått rett forbi den. Derfor heller
 * ingen eier-filter her – det ville bare skjult en feil i policyen.
 */
export async function hentGjøremål(): Promise<{ åpne: Gjøremål[]; gjort: Gjøremål[] }> {
  const supabase = await lagServerKlient()

  const [åpne, gjort] = await Promise.all([
    supabase
      .from('gjoremal')
      .select('id, tittel, notat, gjort, opprettet')
      .is('gjort', null)
      .order('opprettet', { ascending: false }),
    supabase
      .from('gjoremal')
      .select('id, tittel, notat, gjort, opprettet')
      .not('gjort', 'is', null)
      .order('gjort', { ascending: false })
      .limit(GJORT_GRENSE),
  ])

  const feil = åpne.error ?? gjort.error
  if (feil) throw new Error(`Kunne ikke hente gjøremål: ${feil.message}`)

  return { åpne: åpne.data ?? [], gjort: gjort.data ?? [] }
}

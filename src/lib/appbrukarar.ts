import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/admin'
import type { AppStatus } from '@/lib/appsok'

export type AppkontoStatus = AppStatus

/** En registrering som aldri ble til en person. Se `ny_appbrukar()`. */
export type Foreldreløs = {
  navBrukerId: string
  epost: string
  registrert: string
}

/**
 * Registreringer som ikke ble til en person.
 *
 * Triggeren svelger unntak med vilje, fordi den kjører inne i GoTrue sin
 * transaksjon og et unntak der ville gitt brukeren en 500 ingen kan tolke.
 * Prisen er at en registrering kan feile stille. Dette er den eneste måten
 * en slik konto kan bli sett – uten denne listen finnes den ikke for noen.
 *
 * Adminbordets egne innlogginger er ikke foreldreløse. De har aldri en
 * `personer`-rad, og skal ikke ha det.
 */
export async function hentForeldreløse(): Promise<Foreldreløs[]> {
  const [{ data: brukere, error: brukerFeil }, koblet, admin] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
    supabaseAdmin.from('personer').select('nav_bruker_id').not('nav_bruker_id', 'is', null),
    supabaseAdmin.from('admin_brukere').select('id'),
  ])

  if (brukerFeil) throw new Error(`Kunne ikke hente navbrukere: ${brukerFeil.message}`)

  const kjente = new Set<string>()
  for (const rad of koblet.data ?? []) if (rad.nav_bruker_id) kjente.add(rad.nav_bruker_id)
  for (const rad of admin.data ?? []) if (rad.id) kjente.add(rad.id)

  return brukere.users
    .filter((b) => !kjente.has(b.id))
    .map((b) => ({
      navBrukerId: b.id,
      epost: b.email ?? '(ukjent)',
      registrert: b.created_at,
    }))
    .sort((a, b) => b.registrert.localeCompare(a.registrert))
}

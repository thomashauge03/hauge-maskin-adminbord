import 'server-only'

import { lagServerKlient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export type AppkontoStatus = 'venter' | 'godkjent' | 'sperra'

export type Appkonto = {
  id: string
  navn: string
  epost: string
  telefon: string | null
  status: AppkontoStatus
  navBrukerId: string
  godkjentTid: string | null
  registrert: string
  /**
   * Har personen tilgang i minst ett av de andre systemene fra før?
   *
   * Dette er det viktigste på skjermen. Appen ligger åpent, så hvem som
   * helst kan sende en forespørsel. En som allerede finnes i utleien eller
   * rørlageret er en kollega; en som ikke gjør det kan være hvem som helst.
   */
  kjentFraFør: boolean
}

/** En registrering som aldri ble til en person. Se `ny_appbrukar()`. */
export type Foreldreløs = {
  navBrukerId: string
  epost: string
  registrert: string
}

type PersonRad = {
  id: string
  navn: string
  epost: string
  telefon: string | null
  status: AppkontoStatus
  nav_bruker_id: string
  godkjent_tid: string | null
  opprettet: string
  system_tilgang: { system_id: string }[] | null
}

function tilAppkonto(rad: PersonRad): Appkonto {
  return {
    id: rad.id,
    navn: rad.navn,
    epost: rad.epost,
    telefon: rad.telefon,
    status: rad.status,
    navBrukerId: rad.nav_bruker_id,
    godkjentTid: rad.godkjent_tid,
    registrert: rad.opprettet,
    kjentFraFør: (rad.system_tilgang?.length ?? 0) > 0,
  }
}

/**
 * Alle som har registrert seg i appen.
 *
 * `nav_bruker_id is not null` er ikke en detalj: `personer` inneholder også
 * folk som bare finnes i de andre systemene. Uten dette leddet ville de
 * dukket opp som forespørsler de aldri har sendt.
 */
export async function hentAppkontoer(): Promise<Appkonto[]> {
  const supabase = await lagServerKlient()

  const { data, error } = await supabase
    .from('personer')
    .select('id, navn, epost, telefon, status, nav_bruker_id, godkjent_tid, opprettet, system_tilgang(system_id)')
    .not('nav_bruker_id', 'is', null)
    .order('opprettet', { ascending: false })

  if (error) throw new Error(`Kunne ikke hente appkontoer: ${error.message}`)
  return (data as PersonRad[]).map(tilAppkonto)
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

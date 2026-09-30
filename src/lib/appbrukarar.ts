import 'server-only'

import type { User } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { alleRader } from '@/lib/supabase/alle-rader'
import type { AppStatus, Appbruker } from '@/lib/appsok'

export type AppkontoStatus = AppStatus

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
  status: AppStatus
  opprettet: string
  system_tilgang: { system_id: string }[] | null
}

/**
 * Alle som har registrert seg i appen, slanke nok til å søkes i i nettleseren.
 *
 * Fire spørringer, uansett hvor mange det er. Den forrige utgaven spurte én
 * gang per godkjent person og sendte hele sidelista med ikoner til hver rad –
 * ved 200 brukere rundt 100 MB per visning.
 *
 * `nav_bruker_id is not null` er ikke en detalj: `personer` inneholder også
 * folk som bare finnes i de andre systemene, og de har aldri bedt om noe.
 */
export async function hentAppbrukere(): Promise<{
  brukere: Appbruker[]
  grupper: { id: string; navn: string }[]
}> {
  const [personer, medlemskap, grupper, unntak] = await Promise.all([
    alleRader<PersonRad>('appbrukerne', (fra, til) =>
      supabaseAdmin
        .from('personer')
        .select('id, navn, epost, telefon, status, opprettet, system_tilgang(system_id)')
        .not('nav_bruker_id', 'is', null)
        .order('id')
        .range(fra, til),
    ),
    alleRader<{ person_id: string; gruppe_id: string }>('gruppemedlemskapene', (fra, til) =>
      supabaseAdmin
        .from('person_gruppe')
        .select('person_id, gruppe_id')
        .order('person_id')
        .order('gruppe_id')
        .range(fra, til),
    ),
    supabaseAdmin.from('grupper').select('id, navn').order('sortering').order('navn'),
    alleRader<{ person_id: string }>('unntakene', (fra, til) =>
      supabaseAdmin
        .from('side_tilgang')
        .select('person_id')
        .order('person_id')
        .order('side_id')
        .range(fra, til),
    ),
  ])

  if (grupper.error) throw new Error(`Kunne ikke hente gruppene: ${grupper.error.message}`)

  const grupperPer = new Map<string, string[]>()
  for (const m of medlemskap) {
    const liste = grupperPer.get(m.person_id) ?? []
    liste.push(m.gruppe_id)
    grupperPer.set(m.person_id, liste)
  }

  const unntakPer = new Map<string, number>()
  for (const u of unntak) unntakPer.set(u.person_id, (unntakPer.get(u.person_id) ?? 0) + 1)

  return {
    brukere: personer.map((p) => ({
      id: p.id,
      navn: p.navn,
      epost: p.epost,
      telefon: p.telefon,
      status: p.status,
      registrert: p.opprettet,
      kjentFraFør: (p.system_tilgang?.length ?? 0) > 0,
      grupper: grupperPer.get(p.id) ?? [],
      unntak: unntakPer.get(p.id) ?? 0,
    })),
    grupper: (grupper.data ?? []).map((g) => ({ id: g.id as string, navn: g.navn as string })),
  }
}

/**
 * Hvor mange som venter på svar – tallet på «Appen» i menyen.
 *
 * Feiler den, er svaret 0. Layouten står rundt hele adminbordet, og skal
 * aldri falle fordi et tall ikke kom.
 */
export async function tellVentende(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('personer')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'venter')
    .not('nav_bruker_id', 'is', null)
  return error ? 0 : (count ?? 0)
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
  const [brukere, koblet, admin] = await Promise.all([
    alleNavbrukere(),
    alleRader<{ nav_bruker_id: string }>('personene med innlogging', (fra, til) =>
      supabaseAdmin
        .from('personer')
        .select('nav_bruker_id')
        .not('nav_bruker_id', 'is', null)
        .order('id')
        .range(fra, til),
    ),
    supabaseAdmin.from('admin_brukere').select('id'),
  ])

  const kjente = new Set<string>()
  for (const rad of koblet) kjente.add(rad.nav_bruker_id)
  for (const rad of admin.data ?? []) if (rad.id) kjente.add(rad.id as string)

  return brukere
    .filter((b) => !kjente.has(b.id))
    .map((b) => ({ navBrukerId: b.id, epost: b.email ?? '(ukjent)', registrert: b.created_at }))
    .sort((a, b) => b.registrert.localeCompare(a.registrert))
}

/** Alle innloggingene i navet. listUsers gir høyst 1000 om gangen. */
async function alleNavbrukere(): Promise<User[]> {
  const ut: User[] = []
  for (let side = 1; ; side++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: side, perPage: 1000 })
    if (error) throw new Error(`Kunne ikke hente navbrukere: ${error.message}`)
    ut.push(...data.users)
    if (data.users.length < 1000) return ut
  }
}

import { redirect } from 'next/navigation'
import { lagServerKlient } from '@/lib/supabase/server'
import type { AdminBruker, AdminRolle } from '@/lib/typer'
import 'server-only'

/** Siden brukeren sendes til når passordet må byttes. */
export const BYTT_PASSORD_STI = '/bytt-passord'

/** Henter innlogget bruker, eller null om ingen er logget inn. */
export async function hentAdmin(): Promise<AdminBruker | null> {
  const supabase = await lagServerKlient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  /*
   * `select('*')` framfor navngitte kolonner med vilje.
   *
   * Ber vi om en kolonne som ennå ikke finnes, feiler hele spørringen,
   * og da returnerer denne null – altså «ikke innlogget» for alle. Én
   * ukjørt migrasjon ville låst hele adminbordet ute, og adminbordet er
   * nettopp det stedet man går for å fikse slikt.
   */
  const { data } = await supabase
    .from('admin_brukere')
    .select('*')
    .eq('id', user.id)
    .eq('aktiv', true)
    .single()

  if (!data) return null

  return {
    id: data.id,
    navn: data.navn,
    epost: data.epost,
    // Faller tilbake til den svakeste rollen om kolonnen mangler.
    // Feilretningen skal aldri gi mer tilgang enn tilsiktet.
    rolle: (data.rolle as AdminRolle) ?? 'drift',
    aktiv: true,
    maByttePassord: data.ma_bytte_passord ?? false,
  }
}

/**
 * Krever innlogget bruker, uten å tvinge passordbytte.
 *
 * Brukes av selve passordbyttesiden. Uten dette ville krevAdmin sendt
 * brukeren dit den allerede står, i en evig omdirigering.
 */
export async function krevInnlogget(): Promise<AdminBruker> {
  const bruker = await hentAdmin()
  if (!bruker) redirect('/logg-inn')
  return bruker
}

/**
 * Krever innlogget bruker med tilgang til adminbordet.
 *
 * Må kalles øverst i hver side OG i hver server action. En server
 * action er en POST-rute som kan treffes direkte utenfra, så verken
 * proxy.ts eller layouten er tilstrekkelig sikring alene.
 */
export async function krevAdmin(): Promise<AdminBruker> {
  const bruker = await hentAdmin()
  if (!bruker) redirect('/logg-inn')
  // Midlertidig passord må byttes før man slipper videre.
  if (bruker.maByttePassord) redirect(BYTT_PASSORD_STI)
  return bruker
}

/**
 * Krever eier-rollen.
 *
 * Skillet mot krevAdmin er ikke byråkrati: eier kan lese service
 * role-nøkler og opprette brukere i sju produksjonsdatabaser. Alt som
 * rører nøkler, systemregisteret eller brukere i andre systemer går
 * gjennom denne. Alt som bare leser status klarer seg med krevAdmin.
 */
export async function krevEier(): Promise<AdminBruker> {
  const bruker = await krevAdmin()
  if (bruker.rolle !== 'eier') redirect('/')
  return bruker
}

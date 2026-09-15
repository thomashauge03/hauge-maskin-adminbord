import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/admin'
import { hentRaaSider } from '@/lib/github-sider'

/**
 * Sidene i mobilappen.
 *
 * De bor i `sider.json` på GitHub, samme fil skrivebordsappen leser og
 * skriver. Begge kan redigere; GitHub hindrer at de overskriver hverandre
 * ved å kreve SHA-en til versjonen man så. Se lib/github-sider.ts.
 */

export type Side = {
  id: string
  navn: string
  gruppe: string
  url: string
  hjelp?: string
  /** Sider merket 'pc' vises aldri på telefonen, uansett tilgang. */
  barePC: boolean
}

export type SideMedOppsett = Side & {
  /** Får alle godkjente denne uten at noen har gjort noe? */
  standard: boolean
}

/**
 * Henter sidelista slik appen ser den.
 *
 * Feiler hentingen, kaster vi. Alternativet - å svare med tom liste - ville
 * sett ut som «ingen sider finnes», og en admin kunne krysset av på et tomt
 * skjema uten å forstå hvorfor ingenting stod der.
 */
export async function hentSiderFraFila(): Promise<Side[]> {
  const { sider } = await hentRaaSider()

  return sider
    .filter((p) => p && p.name && p.url && p.hidden !== true)
    .map((p) => ({
      id: String(p.id || p.name),
      navn: String(p.name),
      gruppe: p.group ? String(p.group) : 'Annet',
      url: String(p.url),
      hjelp: p.help ? String(p.help) : undefined,
      barePC: p.plattform === 'pc',
    }))
}

/** Side-id-ene som IKKE er standard. En side er standard hvis den ikke står her. */
export async function hentIkkeStandard(): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from('side_standard')
    .select('side_id')
    .eq('standard', false)

  if (error) throw new Error(`Kunne ikke lese standardoppsettet: ${error.message}`)
  return new Set((data ?? []).map((r) => r.side_id as string))
}

/** Unntakene for én person: side-id → får den (true) eller får den ikke (false). */
export async function hentUnntakFor(personId: string): Promise<Map<string, boolean>> {
  const { data, error } = await supabaseAdmin
    .from('side_tilgang')
    .select('side_id, gi')
    .eq('person_id', personId)

  if (error) throw new Error(`Kunne ikke lese tilgangene: ${error.message}`)
  return new Map((data ?? []).map((r) => [r.side_id as string, r.gi as boolean]))
}

/** Hvor mange personer som avviker per side. Brukes bare til å vise tallet. */
export async function hentAvvikPerSide(): Promise<Map<string, number>> {
  const { data, error } = await supabaseAdmin.from('side_tilgang').select('side_id')
  if (error) throw new Error(`Kunne ikke telle avvikene: ${error.message}`)

  const tall = new Map<string, number>()
  for (const r of data ?? []) {
    const id = r.side_id as string
    tall.set(id, (tall.get(id) ?? 0) + 1)
  }
  return tall
}

/**
 * Rader som peker på en side som ikke finnes lenger.
 *
 * Det finnes ingen fremmednøkkel til sidene - de bor i en fil på GitHub, ikke
 * i denne databasen. Slettes en side der, blir radene her liggende igjen. De
 * gjør ingen skade, men de er usynlige uten dette, og da hoper de seg opp.
 */
export function finnForeldreløseTilganger(
  kjenteSideIder: Set<string>,
  ikkeStandard: Set<string>,
  avvik: Map<string, number>,
): string[] {
  const foreldreløse = new Set<string>()
  for (const id of ikkeStandard) if (!kjenteSideIder.has(id)) foreldreløse.add(id)
  for (const id of avvik.keys()) if (!kjenteSideIder.has(id)) foreldreløse.add(id)
  return [...foreldreløse].sort()
}

/**
 * Får personen se denne siden?
 *
 * MÅ være samme regel som visningen `mine_sideval` i migrasjon 0016:
 *
 *   1. Har personen et eget unntak?     → det avgjør, uansett resten.
 *   2. Er siden standard?               → ja.
 *   3. Gir en av gruppene hans den?     → ja.
 *   4. Ellers                           → nei.
 *
 * Endres den ene uten den andre, viser adminbordet noe annet enn appen gjør,
 * og da er avkryssingen verre enn ingen avkryssing.
 */
export function serSiden(
  side: Side,
  standard: boolean,
  unntak: Map<string, boolean>,
  fraGrupper?: Set<string>,
): boolean {
  const mitt = unntak.get(side.id)
  if (mitt !== undefined) return mitt
  if (standard) return true
  return fraGrupper?.has(side.id) ?? false
}

import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/admin'
import { alleRader } from '@/lib/supabase/alle-rader'

/**
 * Grupper: sjåfør, kontor, verksted, kunder.
 *
 * Ingen ser noe i appen før de er i en gruppe. Per-person-unntak finnes
 * fortsatt for de få tilfellene som ikke passer i noen gruppe, og de veier
 * tyngst. Regelen står i lib/sideregel.ts og i migrasjon 0017.
 */
export type Gruppe = {
  id: string
  navn: string
  beskrivelse: string | null
  sortering: number
  /** Side-id-ene gruppa gir. */
  sider: string[]
  antallPersoner: number
}

export async function hentGrupper(): Promise<Gruppe[]> {
  const [grupper, koblinger, medlemmer] = await Promise.all([
    supabaseAdmin
      .from('grupper')
      .select('id, navn, beskrivelse, sortering')
      .order('sortering')
      .order('navn'),
    alleRader<{ gruppe_id: string; side_id: string }>('gruppesidene', (fra, til) =>
      supabaseAdmin
        .from('gruppe_sider')
        .select('gruppe_id, side_id')
        .order('gruppe_id')
        .order('side_id')
        .range(fra, til),
    ),
    alleRader<{ gruppe_id: string }>('gruppemedlemskapene', (fra, til) =>
      supabaseAdmin
        .from('person_gruppe')
        .select('gruppe_id')
        .order('person_id')
        .order('gruppe_id')
        .range(fra, til),
    ),
  ])

  if (grupper.error) throw new Error(`Kunne ikke hente gruppene: ${grupper.error.message}`)

  const sider = new Map<string, string[]>()
  for (const k of koblinger) {
    const liste = sider.get(k.gruppe_id) ?? []
    liste.push(k.side_id)
    sider.set(k.gruppe_id, liste)
  }

  const antall = new Map<string, number>()
  for (const m of medlemmer) antall.set(m.gruppe_id, (antall.get(m.gruppe_id) ?? 0) + 1)

  return (grupper.data ?? []).map((g) => ({
    id: g.id as string,
    navn: g.navn as string,
    beskrivelse: (g.beskrivelse as string | null) ?? null,
    sortering: g.sortering as number,
    sider: sider.get(g.id as string) ?? [],
    antallPersoner: antall.get(g.id as string) ?? 0,
  }))
}

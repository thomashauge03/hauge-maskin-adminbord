import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Grupper: sjåfør, kontor, verksted.
 *
 * Uten dem må hver nyansatt krysses av mot hver side. Med tretten sider og
 * tjue personer er det tre hundre kryss ingen holder styr på.
 *
 * Per-person-unntak forsvinner ikke - de er der for de få tilfellene som ikke
 * passer i noen gruppe, og de veier tyngst. Regelen står i migrasjon 0016 og
 * er speilet i `serSiden` i sidetilgang.ts. Endres den ene, må den andre
 * følge etter, ellers viser adminbordet noe annet enn appen gjør.
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
    supabaseAdmin.from('gruppe_sider').select('gruppe_id, side_id'),
    supabaseAdmin.from('person_gruppe').select('gruppe_id'),
  ])

  if (grupper.error) throw new Error(`Kunne ikke hente gruppene: ${grupper.error.message}`)
  if (koblinger.error) throw new Error(`Kunne ikke hente gruppesidene: ${koblinger.error.message}`)

  const sider = new Map<string, string[]>()
  for (const k of koblinger.data ?? []) {
    const liste = sider.get(k.gruppe_id as string) ?? []
    liste.push(k.side_id as string)
    sider.set(k.gruppe_id as string, liste)
  }

  const antall = new Map<string, number>()
  for (const m of medlemmer.data ?? []) {
    const id = m.gruppe_id as string
    antall.set(id, (antall.get(id) ?? 0) + 1)
  }

  return (grupper.data ?? []).map((g) => ({
    id: g.id as string,
    navn: g.navn as string,
    beskrivelse: (g.beskrivelse as string | null) ?? null,
    sortering: g.sortering as number,
    sider: sider.get(g.id as string) ?? [],
    antallPersoner: antall.get(g.id as string) ?? 0,
  }))
}

/** Hvilke grupper hver person er i. Én spørring, ikke én per person. */
export async function hentGruppekartet(): Promise<Map<string, Set<string>>> {
  const { data, error } = await supabaseAdmin
    .from('person_gruppe')
    .select('person_id, gruppe_id')

  if (error) throw new Error(`Kunne ikke hente gruppemedlemskapene: ${error.message}`)

  const kart = new Map<string, Set<string>>()
  for (const r of data ?? []) {
    const p = r.person_id as string
    if (!kart.has(p)) kart.set(p, new Set())
    kart.get(p)!.add(r.gruppe_id as string)
  }
  return kart
}

/**
 * Side-id-ene en person får gjennom gruppene sine.
 *
 * Merk at dette IKKE tar hensyn til om siden er standard eller til personens
 * egne unntak - det gjør `serSiden`. Denne svarer bare på hva gruppene gir.
 */
export function siderFraGrupper(
  gruppeIder: Set<string> | undefined,
  grupper: Gruppe[],
): Set<string> {
  const ut = new Set<string>()
  if (!gruppeIder || gruppeIder.size === 0) return ut
  for (const g of grupper) {
    if (!gruppeIder.has(g.id)) continue
    for (const s of g.sider) ut.add(s)
  }
  return ut
}

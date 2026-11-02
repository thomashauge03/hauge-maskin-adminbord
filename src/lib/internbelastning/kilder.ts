import { supabaseAdmin } from '@/lib/supabase/admin'
import { lesFraSmartdok } from '@/lib/prosjekter/smartdok'
import { hentTripletexProsjektnumre } from '@/lib/tripletex/tilkobling'
import { beregn, type Beregning, type Maskin, type Maskintime, type Unntak } from './beregning'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Henter det beregningen trenger for én måned. Bare lesing, både mot
   SmartDok og Tripletex.

   Timene hentes med GET /WorkHours (v1) og includeMachineHours: der kommer
   hver maskintime som egen rad med MachineHourId, EquipmentId (= maskinens
   id) og ProjectNumber, og NetHours er maskintimene. Sjekket 2. november
   mot /WorkHours/v2 for august til oktober: samme 9 130,2 timer.
   ═══════════════════════════════════════════════════════════ */

export type Unntaksrad = Unntak & { id: string; navn: string; lagtInnAv: string | null; opprettet: string }

export type Månedsvisning = {
  måned: string
  startdato: string
  /** Hele måneden ligger før startdatoen, og sendes aldri. */
  førStart: boolean
  beregning: Beregning
  unntak: Unntaksrad[]
  /** Hvorfor prosjektene ikke ble sjekket mot Tripletex, når de ikke ble det. */
  tripletexFeil: string | null
}

function liste(svar: unknown): unknown[] {
  if (Array.isArray(svar)) return svar
  // /Machines og /Projects svarer { Count, Offset, TotalCount, Items }.
  const items = svar && typeof svar === 'object' ? (svar as Record<string, unknown>).Items : undefined
  return Array.isArray(items) ? items : []
}

const tall = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const tekst = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

function tilMaskin(x: unknown): Maskin | null {
  const m = x as Record<string, unknown>
  const id = tall(m?.Id)
  if (id === null) return null
  return {
    id,
    nummer: tekst(m.InternalNumber),
    navn: tekst(m.Name) ?? `Maskin ${id}`,
    kategori: tekst(m.CategoryName),
    sats: tall(m.InternalCost),
  }
}

function tilMaskintime(x: unknown): Maskintime | null {
  const r = x as Record<string, unknown>
  const id = tall(r?.MachineHourId)
  const maskinId = tall(r?.EquipmentId)
  const timer = tall(r?.NetHours)
  if (id === null || maskinId === null || timer === null) return null
  return {
    id,
    maskinId,
    timer,
    prosjektnummer: tekst(r.ProjectNumber) ?? (tall(r.ProjectNumber) !== null ? String(r.ProjectNumber) : null),
    prosjektnavn: tekst(r.ProjectName),
    attestert: r.AdminAttested === true,
  }
}

/** Første og siste dag i måneden, «2026-10» → ['2026-10-01', '2026-10-31']. */
export function månedsgrenser(måned: string): [string, string] {
  const [år, mnd] = måned.split('-').map(Number)
  const siste = new Date(Date.UTC(år, mnd, 0)).getUTCDate()
  return [`${måned}-01`, `${måned}-${String(siste).padStart(2, '0')}`]
}

export async function hentUnntak(): Promise<Unntaksrad[]> {
  const { data, error } = await supabaseAdmin
    .from('internbelastning_unntak')
    .select('id, maskin_id, kategori, navn, grunn, lagt_inn_av, opprettet')
    .order('opprettet')
  if (error) throw new Error(`Kunne ikke lese listen «belastes ikke»: ${error.message}`)
  return (data ?? []).map((u) => ({
    id: u.id as string,
    maskinId: (u.maskin_id as number | null) ?? null,
    kategori: (u.kategori as string | null) ?? null,
    navn: u.navn as string,
    grunn: u.grunn as string,
    lagtInnAv: (u.lagt_inn_av as string | null) ?? null,
    opprettet: u.opprettet as string,
  }))
}

export async function hentMåned(måned: string): Promise<Månedsvisning> {
  const [fra, til] = månedsgrenser(måned)

  const [{ data: innstilling }, unntak] = await Promise.all([
    supabaseAdmin.from('internbelastning_innstilling').select('startdato').eq('id', 1).maybeSingle(),
    hentUnntak(),
  ])
  const startdato = (innstilling?.startdato as string | undefined) ?? '2026-11-01'

  // includeExported: en lønnseksport skal ikke skjule timer for internbelastningen.
  const [timesvar, maskinsvar] = await lesFraSmartdok([
    `/WorkHours?fromDate=${fra}&toDate=${til}T23:59:59&onlyAttested=false&includeExported=true&includeMachineHours=true`,
    '/Machines?all=true',
  ])
  const rader = liste(timesvar).map(tilMaskintime).filter((r): r is Maskintime => r !== null)
  const maskiner = liste(maskinsvar).map(tilMaskin).filter((m): m is Maskin => m !== null)

  let tripletexProsjekter: Set<string> | null = null
  let tripletexFeil: string | null = null
  try {
    tripletexProsjekter = await hentTripletexProsjektnumre()
  } catch (e) {
    tripletexFeil = e instanceof Error ? e.message : String(e)
  }

  return {
    måned,
    startdato,
    førStart: til < startdato,
    beregning: beregn({ rader, maskiner, unntak, tripletexProsjekter }),
    unntak,
    tripletexFeil,
  }
}

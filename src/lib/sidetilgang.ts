import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/admin'
import { alleRader } from '@/lib/supabase/alle-rader'
import { hentRaaSider, type RaaSide } from '@/lib/github-sider'

/**
 * Sidene i mobilappen.
 *
 * De bor i `sider.json` på GitHub, samme fil skrivebordsappen leser og
 * skriver. Begge kan redigere; GitHub hindrer at de overskriver hverandre
 * ved å kreve SHA-en til versjonen man så. Se lib/github-sider.ts.
 *
 * Hvem som ser hvilken side står i lib/sideregel.ts.
 */

export type Side = {
  id: string
  navn: string
  gruppe: string
  url: string
  hjelp?: string
  /**
   * Ikonet, som en data-URI rett i fila.
   *
   * Sånn gjør skrivebordsappen det, og formatet må være likt – ellers får du
   * to slags ikoner avhengig av hvor siden ble lagt inn. 192 × 192 PNG.
   */
  bilete?: string
  /** Faller tilbake på denne med forbokstaven når det ikke finnes ikon. */
  farge?: string
  /** Sider merket 'pc' vises aldri på telefonen, uansett tilgang. */
  barePC: boolean
  /** Nøkkelknappen i mobilappen. Mangler feltet i fila, er den på. */
  nokkel: boolean
}

function tilSider(raa: RaaSide[]): Side[] {
  return raa
    .filter((p) => p && p.name && p.url && p.hidden !== true)
    .map((p) => ({
      id: String(p.id || p.name),
      navn: String(p.name),
      gruppe: p.group ? String(p.group) : 'Annet',
      url: String(p.url),
      hjelp: p.help ? String(p.help) : undefined,
      bilete: p.image ? String(p.image) : undefined,
      farge: p.color ? String(p.color) : undefined,
      barePC: p.plattform === 'pc',
      nokkel: p.nokkel !== false,
    }))
}

/**
 * Henter sidelista slik appen ser den.
 *
 * Feiler hentingen, kaster vi. Alternativet – å svare med tom liste – ville
 * sett ut som «ingen sider finnes», og en admin kunne krysset av på et tomt
 * skjema uten å forstå hvorfor ingenting stod der.
 */
export async function hentSiderFraFila(): Promise<Side[]> {
  const { sider } = await hentRaaSider()
  return tilSider(sider)
}

/** Alle side-id-ene i fila – også skjulte og halvferdige. */
function alleIderI(raa: RaaSide[]): Set<string> {
  return new Set(raa.map((p) => String(p?.id || p?.name || '')).filter(Boolean))
}

/**
 * Sidelista og alle id-ene i fila, fra én henting.
 *
 * «Finnes ikke lenger» må avgjøres mot hele fila. Lista appen viser, hopper
 * over skjulte sider – en side som er skjult på PC, men har oppsett her,
 * ville ellers sett foreldreløs ut, og «Rydd bort» ville slettet oppsettet
 * den skal ha tilbake når den vises igjen.
 */
export async function hentSidelista(): Promise<{ sider: Side[]; alleIder: Set<string> }> {
  const { sider } = await hentRaaSider()
  return { sider: tilSider(sider), alleIder: alleIderI(sider) }
}

export async function hentAlleSideIder(): Promise<Set<string>> {
  const { sider } = await hentRaaSider()
  return alleIderI(sider)
}

/** Hvor mange personer som har et eget unntak, per side. */
export async function hentAvvikPerSide(): Promise<Map<string, number>> {
  const rader = await alleRader<{ side_id: string }>('unntakene', (fra, til) =>
    supabaseAdmin
      .from('side_tilgang')
      .select('side_id')
      .order('person_id')
      .order('side_id')
      .range(fra, til),
  )

  const tall = new Map<string, number>()
  for (const r of rader) tall.set(r.side_id, (tall.get(r.side_id) ?? 0) + 1)
  return tall
}

/**
 * Side-id-ene i side_standard.
 *
 * Tabellen leses bare av mine_sideval, som gamle appversjoner bruker, og
 * ingenting nytt skriver til den. Rader der som peker på en slettet side,
 * skal likevel kunne ryddes.
 */
export async function hentSideStandardIder(): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from('side_standard').select('side_id')
  if (error) throw new Error(`Kunne ikke lese side_standard: ${error.message}`)
  return (data ?? []).map((r) => r.side_id as string)
}

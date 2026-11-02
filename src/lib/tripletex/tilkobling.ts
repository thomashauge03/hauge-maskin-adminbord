import { supabaseAdmin } from '@/lib/supabase/admin'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Tripletex-nøkkelen til internbelastningen. Selve internbelastningen er
   en egen app (C:\Users\thoma\internbelastning, repo
   thomashauge03/hauge-maskin-internbelastning), som leser nøkkelen herfra
   gjennom navet. Her legges den bare inn og prøves.

   Samme nøkkeltype som grusappen bruker: en API-nøkkel fra Tripletex som
   byttes mot et kortlevd sesjonstoken med /token/session/:createFromRefreshToken,
   og tokenet går som Basic med brukernavn 0. Fallgruvene derfra gjelder her
   også, se hauge-maskin-grus/docs/superpowers/TRIPLETEX-OVERLEVERING.md.

   Svarteksten fra Tripletex vises og lagres aldri. Regnskaps-API-er gjentar
   det de avviste, og utviklervilkårene forbyr å samle det opp. Bare status
   og vår egen melding går videre.
   ═══════════════════════════════════════════════════════════ */

const ADRESSE = 'https://tripletex.no/v2'

/** Tripletex avviser under 300 sekunder med 422. */
const TTL_SEKUNDER = 300

const TIDSAVBRUDD_MS = 20_000

/** Prosjektet maskintimene godskrives, fra e-posten til Karl Kristian. */
export const OBJEKTPROSJEKT = '2011700'

export type Tripletextilkobling = { hint: string | null; firma: string | null; endret: string | null } | null

export async function hentTripletexTilkobling(): Promise<Tripletextilkobling> {
  const { data } = await supabaseAdmin
    .from('tripletex_tilkobling')
    .select('nokkel_kryptert, hint, firma, endret')
    .eq('id', 1)
    .maybeSingle()
  if (!data?.nokkel_kryptert) return null
  return { hint: data.hint as string | null, firma: data.firma as string | null, endret: data.endret as string | null }
}

async function kall(sti: string, init: RequestInit): Promise<{ status: number; json: unknown }> {
  let svar: Response
  try {
    svar = await fetch(`${ADRESSE}${sti}`, { ...init, cache: 'no-store', signal: AbortSignal.timeout(TIDSAVBRUDD_MS) })
  } catch {
    // Feilen fra fetch siteres ikke: den kan inneholde det vi sendte.
    throw new Error('Fikk ikke kontakt med Tripletex.')
  }
  let json: unknown = null
  try {
    json = await svar.json()
  } catch {
    // Et svar uten JSON er like ubrukelig som et tomt, og teksten skal uansett ikke videre.
  }
  return { status: svar.status, json }
}

function felt(x: unknown, ...nøkler: string[]): unknown {
  return nøkler.reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), x)
}

export async function sesjonstoken(nøkkel: string): Promise<string> {
  const { status, json } = await kall('/token/session/:createFromRefreshToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ refreshToken: nøkkel, ttlSeconds: TTL_SEKUNDER }),
  })
  if (status === 429 || status >= 500) throw new Error(`Tripletex kunne ikke gi et sesjonstoken akkurat nå (${status}). Prøv igjen om litt.`)
  if (status < 200 || status >= 300) {
    throw new Error(`Tripletex godtok ikke nøkkelen (${status}). Lag en ny under API-nøkler i Tripletex.`)
  }
  const token = felt(json, 'value', 'token')
  if (typeof token !== 'string' || !token) throw new Error('Tripletex ga ikke noe sesjonstoken.')
  return token
}

export type Nøkkelprøve = {
  firma: string
  /** Null når nøkkelen ikke får lese prosjekter. */
  objektprosjekt: { finnes: boolean } | null
  kanLeseHovedbok: boolean
}

/**
 * Prøver nøkkelen uten å skrive noe: hvilket regnskap den peker på, om den ser
 * 2011700, og om den får lese kontoplanen. Om den får føre bilag, kan bare
 * prøves ved å føre ett, og det gjøres ikke her.
 */
export async function prøvTripletexNøkkel(nøkkel: string): Promise<Nøkkelprøve> {
  const token = await sesjonstoken(nøkkel)
  const hode = { Authorization: `Basic ${Buffer.from(`0:${token}`).toString('base64')}`, Accept: 'application/json' }

  const meg = await kall('/token/session/%3EwhoAmI', { headers: hode })
  if (meg.status !== 200) throw new Error(`Tripletex svarte ${meg.status} på hvem nøkkelen tilhører.`)
  // whoAmI gir company som null med API-nøkkel, så navnet hentes fra firmaet selv.
  const firmaId = felt(meg.json, 'value', 'companyId')
  const selskap = Number.isSafeInteger(firmaId)
    ? await kall(`/company/${firmaId}?fields=name`, { headers: hode })
    : null
  const firma = felt(selskap?.json, 'value', 'name')

  /*
   * Filtrert hos oss også: grusappen fant at Tripletex overser noen filtre
   * stille (?name= og ?customerNumber= på kunder), og da ville første treff
   * sett ut som 2011700.
   */
  const prosjekt = await kall(`/project?number=${OBJEKTPROSJEKT}&fields=number&count=100`, { headers: hode })
  const verdier = felt(prosjekt.json, 'values')
  const objektprosjekt =
    prosjekt.status === 200 && Array.isArray(verdier)
      ? { finnes: verdier.some((p) => String(felt(p, 'number')) === OBJEKTPROSJEKT) }
      : null

  const konto = await kall('/ledger/account?count=1&fields=id', { headers: hode })

  return {
    firma: typeof firma === 'string' && firma ? firma : 'ukjent firma',
    objektprosjekt,
    kanLeseHovedbok: konto.status === 200,
  }
}

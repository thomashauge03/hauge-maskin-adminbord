import 'server-only'

import { env } from '@/lib/env'

/**
 * Sidelista i mobilappen, lest og skrevet der den faktisk bor.
 *
 * Den ligger i `sider.json` i hauge-maskin-app på GitHub, ikke i denne
 * databasen. Skrivebordsappen leser og skriver den samme fila, og PC-en er den
 * primære plattformen – flyttet vi fasiten hit, ville den appen enten mistet
 * redigeringen sin eller fått en annen sannhet enn denne.
 *
 * Begge kan altså skrive. Det er trygt fordi GitHub krever at man sender med
 * SHA-en til den versjonen man så: har noen andre skrevet imellom, svarer
 * GitHub 409 og vi sier fra, i stedet for å overskrive dem stille.
 */
const EIER = 'thomashauge03'
const REPO = 'hauge-maskin-app'
const FIL = 'sider.json'

const API = `https://api.github.com/repos/${EIER}/${REPO}/contents/${FIL}`
const RAA = `https://raw.githubusercontent.com/${EIER}/${REPO}/main/${FIL}`

/**
 * Én side slik den ligger i fila.
 *
 * Ukjente felt beholdes. Skrivebordsappen kan ha lagt inn noe vi ikke kjenner,
 * og et felt vi kaster ved første redigering herfra er borte for alltid.
 */
export type RaaSide = {
  id?: string
  name?: string
  url?: string
  group?: string
  help?: string
  color?: string
  image?: string
  plattform?: string
  hidden?: boolean
  [annet: string]: unknown
}

export const kanRedigereSider = () => Boolean(env.HM_GITHUB_TOKEN)

type Henta = {
  sider: RaaSide[]
  /** Null når vi leste uten token. Da kan vi vise, men ikke skrive. */
  sha: string | null
  /**
   * Alt annet som lå på toppnivå i fila.
   *
   * `sider.json` er ikke en array – den er `{ "_om": "…", "pages": [ … ] }`,
   * der `_om` forklarer for den som åpner fila hva den er. Skrivebordsappen
   * skriver den samme formen tilbake.
   *
   * Uten dette ville vi skrevet en bar array, og da var `_om` borte og
   * formatet endret. Begge appene tåler begge former, så ingenting ville
   * sluttet å virke – filen ville bare stille mistet forklaringen sin, og
   * ingen ville skjønt når eller hvorfor.
   *
   * Null betyr at fila FAKTISK var en bar array. Da skriver vi array tilbake.
   */
  hylse: Record<string, unknown> | null
}

function pakkUt(json: unknown): { sider: RaaSide[]; hylse: Record<string, unknown> | null } {
  if (Array.isArray(json)) return { sider: json as RaaSide[], hylse: null }

  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    if (Array.isArray(o.pages)) {
      const hylse = { ...o }
      delete hylse.pages
      return { sider: o.pages as RaaSide[], hylse }
    }
  }
  return { sider: [], hylse: null }
}

/**
 * Henter lista, og SHA-en hvis vi har token.
 *
 * Med token leser vi gjennom API-et, ikke råfila. Det er ikke for SHA-ens
 * skyld alene: raw.githubusercontent mellomlagrer i noen minutter, så rett
 * etter en endring ville skjermen vist den gamle lista og sett ut som om
 * lagringen ikke virket.
 */
export async function hentRaaSider(): Promise<Henta> {
  if (!env.HM_GITHUB_TOKEN) {
    const res = await fetch(`${RAA}?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Kunne ikke hente sidelista: ${res.status}`)
    return { ...pakkUt(await res.json()), sha: null }
  }

  const res = await fetch(API, {
    headers: {
      Authorization: `Bearer ${env.HM_GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403
        ? 'GitHub-tokenet blir avvist. Sjekk at det har contents: write på hauge-maskin-app.'
        : `Kunne ikke hente sidelista fra GitHub: ${res.status}`,
    )
  }

  const data = (await res.json()) as { content: string; sha: string }
  const tekst = Buffer.from(data.content, 'base64').toString('utf8')
  return { ...pakkUt(JSON.parse(tekst)), sha: data.sha }
}

export type SkriveSvar = { ok: true } | { ok: false; grunn: string; konflikt?: boolean }

/**
 * Skriver lista tilbake.
 *
 * Formatet er med vilje likt det skrivebordsappen skriver – to mellomrom og
 * linjeskift til slutt. Ellers ville hver eneste endring fra den ene appen
 * sett ut som om hele fila var skrevet om, og historikken blitt ubrukelig.
 */
export async function skrivRaaSider(
  sider: RaaSide[],
  sha: string,
  melding: string,
  hylse: Record<string, unknown> | null,
): Promise<SkriveSvar> {
  if (!env.HM_GITHUB_TOKEN) {
    return { ok: false, grunn: 'Adminbordet har ikke GitHub-token, og kan ikke endre sider.' }
  }

  // Samme form som vi leste, og samme form skrivebordsappen skriver.
  const ut = hylse ? { ...hylse, pages: sider } : sider
  const innhald = JSON.stringify(ut, null, 2) + '\n'

  const res = await fetch(API, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.HM_GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: melding,
      content: Buffer.from(innhald, 'utf8').toString('base64'),
      sha,
    }),
  })

  if (res.ok) return { ok: true }

  /*
   * 409 betyr at noen skrev til fila etter at vi leste den – typisk du selv,
   * fra skrivebordsappen. Da skal vi IKKE prøve igjen med samme innhold: den
   * andre endringen ville forsvunnet uten at noen merket det.
   */
  if (res.status === 409) {
    return {
      ok: false,
      konflikt: true,
      grunn:
        'Noen endret sidelista mens du holdt på – sannsynligvis fra skrivebordsappen. Last siden på nytt og gjør endringen om igjen.',
    }
  }

  let detalj = `GitHub svarte ${res.status}`
  try {
    const j = (await res.json()) as { message?: string }
    if (j.message) detalj = j.message
  } catch {
    /* ikke alle feil har JSON */
  }
  return { ok: false, grunn: `Kunne ikke lagre: ${detalj}` }
}

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
 *
 * Ingen import, med vilje: testene kjører fila direkte i Node. Tokenet kommer
 * derfor utenfra – github-sider.ts henter det fra miljøet.
 */
const EIER = 'thomashauge03'
const REPO = 'hauge-maskin-app'
const FIL = 'sider.json'

const REPO_API = `https://api.github.com/repos/${EIER}/${REPO}`
const API = `${REPO_API}/contents/${FIL}`
const RAA = `https://raw.githubusercontent.com/${EIER}/${REPO}/main/${FIL}`

/** Tokenet, og fetch – som testene bytter ut med et GitHub i minnet. */
export type GitHub = { token?: string; hent?: typeof fetch }

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
  /** Nøkkelknappen i mobilappen. Bare `false` står i fila; mangler den, er knappen på. */
  nokkel?: boolean
  [annet: string]: unknown
}

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
  /**
   * Hvorfor GitHub avviste tokenet, når det gjorde det.
   *
   * Da har vi lest råfila i stedet – repoet er offentlig – så lista kan vises,
   * men `sha` er null og ingenting kan lagres. Null når tokenet virket, eller
   * når det ikke finnes noe token.
   */
  tokenfeil: string | null
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
export async function hentSidefila({ token, hent = fetch }: GitHub): Promise<Henta> {
  if (!token) return { ...(await hentRaafila(hent)), tokenfeil: null }

  const res = await hent(API, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.object+json',
    },
    cache: 'no-store',
  })

  /*
   * Et avvist token skal ikke ta sidelista med seg. Repoet er offentlig, så vi
   * leser råfila og sier fra om tokenet – ellers forsvinner lista fra Sider,
   * Grupper og hver person bare fordi tokenet har gått ut, og ingen kan se
   * eller velge sider før noen har laget et nytt.
   */
  if (res.status === 401 || res.status === 403) {
    const feil = tokenFeil(res)
    try {
      return { ...(await hentRaafila(hent)), tokenfeil: feil }
    } catch {
      throw new Error(feil)
    }
  }
  if (!res.ok) throw henteFeil(res)

  const data = (await res.json()) as { content: string; encoding: string; sha: string }
  const tekst =
    data.encoding === 'base64'
      ? Buffer.from(data.content, 'base64').toString('utf8')
      : await hentBlob(data.sha, token, hent)
  return { ...pakkUt(JSON.parse(tekst)), sha: data.sha, tokenfeil: null }
}

/** Råfila, uten token og uten SHA. Kan vises, ikke lagres. */
async function hentRaafila(hent: typeof fetch) {
  const res = await hent(`${RAA}?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Kunne ikke hente sidelista: ${res.status}`)
  return { ...pakkUt(await res.json()), sha: null }
}

/**
 * Innholdet i nøyaktig den versjonen SHA-en peker på.
 *
 * Over 1 MB sender GitHub ikke innholdet med – `content` er tom og `encoding`
 * er «none». Ikonene ligger i fila, rundt 29 kB per side, så det skjer ved
 * omtrent 35 sider.
 *
 * Vi henter blobben med SHA-en vi alt har, ikke fila på nytt. Lagrer
 * skrivebordsappen mellom to kall på fila, kan vi få SHA-en fra den nye
 * versjonen og innholdet fra den gamle. Da godtar GitHub lagringen vår uten
 * 409, og endringen fra skrivebordsappen er borte.
 */
async function hentBlob(sha: string, token: string, hent: typeof fetch): Promise<string> {
  const res = await hent(`${REPO_API}/git/blobs/${sha}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.raw+json',
    },
    cache: 'no-store',
  })
  if (!res.ok) throw henteFeil(res)
  return res.text()
}

function henteFeil(res: Response): Error {
  return new Error(
    res.status === 401 || res.status === 403
      ? tokenFeil(res)
      : `Kunne ikke hente sidelista fra GitHub: ${res.status}`,
  )
}

/**
 * Hva som er galt med tokenet, ut fra svaret GitHub ga.
 *
 * 401 og 403 betyr forskjellige ting, og rådet må følge: et utløpt token
 * hjelper det ikke å gi flere rettigheter. 403 er også det GitHub svarer når
 * grensa for antall kall er nådd – da er tokenet i orden, og det skal ikke
 * byttes.
 */
function tokenFeil(res: Response): string {
  if (res.status === 401) {
    return 'GitHub-tokenet i HM_GITHUB_TOKEN er utløpt eller trukket tilbake. Lag et nytt, legg det inn på Vercel og deploy på nytt.'
  }
  if (res.headers.get('x-ratelimit-remaining') === '0') {
    return 'GitHub har nådd grensa for antall kall fra adminbordet. Prøv igjen om litt.'
  }
  return 'GitHub-tokenet i HM_GITHUB_TOKEN mangler tilgang. Det trenger Contents: Read and write på hauge-maskin-app.'
}

export type SkriveSvar = { ok: true } | { ok: false; grunn: string; konflikt?: boolean }

/**
 * Skriver lista tilbake.
 *
 * Formatet er med vilje likt det skrivebordsappen skriver – to mellomrom og
 * linjeskift til slutt. Ellers ville hver eneste endring fra den ene appen
 * sett ut som om hele fila var skrevet om, og historikken blitt ubrukelig.
 */
export async function skrivSidefila(
  { token, hent = fetch }: GitHub,
  sider: RaaSide[],
  sha: string,
  melding: string,
  hylse: Record<string, unknown> | null,
): Promise<SkriveSvar> {
  if (!token) {
    return { ok: false, grunn: 'Adminbordet har ikke GitHub-token, og kan ikke endre sider.' }
  }

  // Samme form som vi leste, og samme form skrivebordsappen skriver.
  const ut = hylse ? { ...hylse, pages: sider } : sider
  const innhald = JSON.stringify(ut, null, 2) + '\n'

  /*
   * Grensa på 1 MB gjelder bare lesing. Å skrive tåler GitHub opp til 100 MB
   * etter egen endringslogg, og andre melder at 10 MB går og 50 MB stopper
   * med 422. Med 29 kB per side er det langt unna.
   */
  const res = await hent(API, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
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

  if (res.status === 401 || res.status === 403) {
    return { ok: false, grunn: `Kunne ikke lagre: ${tokenFeil(res)}` }
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

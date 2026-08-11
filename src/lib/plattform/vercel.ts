import { env } from '@/lib/env'
import { hentJson, type HentResultat } from './hent'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Vercel REST API.

   Alle prosjektene ligger under et team, og et token med full
   kontotilgang må derfor sende teamId på hvert kall – uten det svarer
   API-et 403, eller, verre, gir en redusert visning der byggefeilene
   mangler uten at noe ser galt ut. Et team-avgrenset token trenger det
   ikke, men det er lovlig å sende det likevel, så vi sender alltid.

   Versjonsnumrene i stiene er ikke like for alle ressurser: prosjekt-
   listen er v10, ett prosjekt er v9, deploy-listen v7 og en enkelt
   deploy v13. Det ser ut som en skrivefeil, men er slik Vercel har
   versjonert dem. Ikke «rett opp».
   ═══════════════════════════════════════════════════════════ */

const BASIS = 'https://api.vercel.com'

/**
 * Alle åtte tilstandene et bygg kan ha. Lista er lengre enn man tror:
 * mangler INITIALIZING eller BLOCKED, viser grensesnittet en tom celle
 * nettopp når noe er unormalt.
 */
export type DeployTilstand =
  | 'BLOCKED'
  | 'BUILDING'
  | 'CANCELED'
  | 'DELETED'
  | 'ERROR'
  | 'INITIALIZING'
  | 'QUEUED'
  | 'READY'

/** Deploy-sammendraget som ligger inni prosjektsvaret. */
type RaaDeploy = {
  id?: string
  /** /v7/deployments kaller den `uid`, alt annet `id`. */
  uid?: string
  url: string | null
  readyState: DeployTilstand
  createdAt: number
  ready?: number
  target?: 'production' | 'staging' | null
  alias?: string[]
  aliasError?: { code: string; message: string } | null
  errorMessage?: string | null
  /*
   * Git-feltene er ikke i Vercel sitt eget skjema – de er dokumentert
   * andre steder og finnes bare når deployen kom fra GitHub. En deploy
   * laget med CLI har ingen meta i det hele tatt.
   */
  meta?: Record<string, string | undefined>
}

type RaaProsjekt = {
  id: string
  name: string
  framework: string | null
  createdAt: number
  updatedAt?: number
  live?: boolean
  paused?: boolean
  link?: { type: string; org?: string; repo?: string; productionBranch?: string }
  targets?: Record<string, RaaDeploy | null>
  latestDeployments?: RaaDeploy[]
}

/** Deploy slik adminbordet bruker den. */
export type Deploy = {
  id: string
  tilstand: DeployTilstand
  /** Vercel sender vertsnavn uten skjema, og null før opplasting er ferdig. */
  url: string | null
  opprettet: string
  klarTid: string | null
  commitSha: string | null
  commitGren: string | null
  commitMelding: string | null
  feilmelding: string | null
  /** Satt når deployen er READY men ikke fikk domenet sitt. */
  aliasFeil: string | null
}

export type VercelProsjekt = {
  id: string
  navn: string
  rammeverk: string | null
  pauset: boolean
  produksjonsGren: string | null
  githubRepo: string | null
  /** Nyeste produksjonsdeploy, om prosjektet har rullet ut noe. */
  produksjon: Deploy | null
}

/** Om integrasjonen kan brukes i det hele tatt. */
export function vercelKlar(): { klar: boolean; grunn?: string } {
  if (!env.VERCEL_TOKEN) {
    return { klar: false, grunn: 'VERCEL_TOKEN er ikke satt.' }
  }
  if (!env.VERCEL_TEAM_ID) {
    return {
      klar: false,
      // Uten teamId kan et fullkonto-token få et redusert svar i stedet
      // for en feil, og da vises byggefeil som «ingen feil».
      grunn: 'VERCEL_TEAM_ID er ikke satt. Uten den kan svarene bli ufullstendige.',
    }
  }
  return { klar: true }
}

function url(sti: string, parametre: Record<string, string> = {}): string {
  const u = new URL(sti, BASIS)
  if (env.VERCEL_TEAM_ID) u.searchParams.set('teamId', env.VERCEL_TEAM_ID)
  for (const [n, v] of Object.entries(parametre)) u.searchParams.set(n, v)
  return u.toString()
}

/**
 * Henter alle prosjekter med nyeste produksjonsdeploy i ett kall.
 *
 * Prosjektsvaret har allerede `targets.production`, så hele oversikten
 * kan tegnes uten et kall per prosjekt. Med ti prosjekter er det
 * forskjellen på ett og elleve kall – og på om vi treffer
 * ratebegrensningen når siden lastes to ganger på rad.
 */
export async function hentVercelProsjekter(): Promise<
  HentResultat<VercelProsjekt[]>
> {
  const klar = vercelKlar()
  if (!env.VERCEL_TOKEN) {
    return {
      ok: false,
      svartidMs: 0,
      feil: { slag: 'avvist', melding: klar.grunn ?? 'Ikke satt opp.' },
    }
  }

  // limit er dokumentert som streng på denne ruten, ikke tall.
  const svar = await hentJson<RaaProsjekt[] | { projects: RaaProsjekt[] }>(
    url('/v10/projects', { limit: '100' }),
    { token: env.VERCEL_TOKEN },
  )

  if (!svar.ok) return svar

  // Ruten svarer enten med en bar liste eller med { projects, pagination }.
  const raa = Array.isArray(svar.data) ? svar.data : svar.data.projects
  return {
    ok: true,
    svartidMs: svar.svartidMs,
    data: (raa ?? []).map(tilProsjekt),
  }
}

function tilProsjekt(p: RaaProsjekt): VercelProsjekt {
  const fraMaal = p.targets?.production ?? null

  /*
   * Rekkefølgen på latestDeployments er ikke dokumentert. Vi sorterer
   * selv i stedet for å stole på indeks 0 – ellers viser oversikten en
   * tilfeldig gammel deploy den dagen Vercel endrer rekkefølgen.
   */
  const fraListe = (p.latestDeployments ?? [])
    .filter((d) => d.target === 'production' || d.target === undefined)
    .sort((a, b) => b.createdAt - a.createdAt)[0]

  const deploy = fraMaal ?? fraListe ?? null

  return {
    id: p.id,
    navn: p.name,
    rammeverk: p.framework,
    pauset: p.paused ?? false,
    produksjonsGren: p.link?.productionBranch ?? null,
    githubRepo:
      p.link?.org && p.link?.repo ? `${p.link.org}/${p.link.repo}` : null,
    produksjon: deploy ? tilDeploy(deploy) : null,
  }
}

export function tilDeploy(d: RaaDeploy): Deploy {
  return {
    id: d.id ?? d.uid ?? '',
    tilstand: d.readyState,
    url: d.url,
    opprettet: new Date(d.createdAt).toISOString(),
    klarTid: d.ready ? new Date(d.ready).toISOString() : null,
    commitSha: d.meta?.githubCommitSha ?? d.meta?.gitlabCommitSha ?? null,
    commitGren: d.meta?.githubCommitRef ?? d.meta?.gitlabCommitRef ?? null,
    commitMelding:
      d.meta?.githubCommitMessage ?? d.meta?.gitlabCommitMessage ?? null,
    feilmelding: d.errorMessage ?? null,
    aliasFeil: d.aliasError?.message ?? null,
  }
}

/**
 * Deploy-historikk for ett prosjekt. Brukes på systemsiden, ikke på
 * oversikten – der holder det siste tilstand.
 */
export async function hentDeployHistorikk(
  prosjektId: string,
  antall = 10,
): Promise<HentResultat<Deploy[]>> {
  if (!env.VERCEL_TOKEN) {
    return {
      ok: false,
      svartidMs: 0,
      feil: { slag: 'avvist', melding: 'VERCEL_TOKEN er ikke satt.' },
    }
  }

  const svar = await hentJson<{ deployments: RaaDeploy[] }>(
    url('/v7/deployments', {
      projectId: prosjektId,
      target: 'production',
      limit: String(antall),
    }),
    { token: env.VERCEL_TOKEN },
  )

  if (!svar.ok) return svar
  return {
    ok: true,
    svartidMs: svar.svartidMs,
    data: (svar.data.deployments ?? []).map(tilDeploy),
  }
}

/**
 * Detaljer om én deploy, inkludert hvilket byggesteg som feilet.
 *
 * Feltene errorStep og errorLink finnes bare når kallet gjøres som eier
 * av deployen – altså med teamId satt. Er de borte, er det oftest
 * tokenet som mangler team, ikke bygget som mangler feil.
 */
export async function hentDeployDetalj(deployId: string): Promise<
  HentResultat<{
    tilstand: DeployTilstand
    feilSteg: string | null
    feilLenke: string | null
    feilmelding: string | null
    inspiserUrl: string | null
  }>
> {
  if (!env.VERCEL_TOKEN) {
    return {
      ok: false,
      svartidMs: 0,
      feil: { slag: 'avvist', melding: 'VERCEL_TOKEN er ikke satt.' },
    }
  }

  const svar = await hentJson<{
    readyState: DeployTilstand
    errorStep?: string
    errorLink?: string
    errorMessage?: string | null
    inspectorUrl?: string | null
  }>(
    url(`/v13/deployments/${encodeURIComponent(deployId)}`, {
      withGitRepoInfo: 'true',
    }),
    { token: env.VERCEL_TOKEN },
  )

  if (!svar.ok) return svar
  return {
    ok: true,
    svartidMs: svar.svartidMs,
    data: {
      tilstand: svar.data.readyState,
      feilSteg: svar.data.errorStep ?? null,
      feilLenke: svar.data.errorLink ?? null,
      feilmelding: svar.data.errorMessage ?? null,
      inspiserUrl: svar.data.inspectorUrl ?? null,
    },
  }
}

/**
 * Egne domener på et prosjekt.
 *
 * `production=true` og `redirects=false` fordi det vi vil vite er
 * hvilken adresse kunden faktisk bruker – ikke alle omdirigeringene
 * som også er registrert på prosjektet.
 */
export async function hentDomener(
  prosjektId: string,
): Promise<HentResultat<{ navn: string; bekreftet: boolean }[]>> {
  if (!env.VERCEL_TOKEN) {
    return {
      ok: false,
      svartidMs: 0,
      feil: { slag: 'avvist', melding: 'VERCEL_TOKEN er ikke satt.' },
    }
  }

  const svar = await hentJson<{
    domains: { name: string; verified: boolean }[]
  }>(
    url(`/v9/projects/${encodeURIComponent(prosjektId)}/domains`, {
      production: 'true',
      redirects: 'false',
    }),
    { token: env.VERCEL_TOKEN },
  )

  if (!svar.ok) return svar
  return {
    ok: true,
    svartidMs: svar.svartidMs,
    data: (svar.data.domains ?? []).map((d) => ({
      navn: d.name,
      bekreftet: d.verified,
    })),
  }
}

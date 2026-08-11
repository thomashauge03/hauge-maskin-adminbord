import { env } from '@/lib/env'
import { hentJson, type HentResultat } from './hent'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Supabase Management API.

   Denne gjør adminbordet langt enklere enn planlagt: med et personal
   access token kan vi både lese prosjektstatus, kjøre lesespørringer og
   HENTE prosjektenes egne nøkler. Det betyr at nøkler i utgangspunktet
   ikke må limes inn manuelt i det hele tatt – tabellen `hemmeligheter`
   er reserve for prosjekter som ligger utenfor tokenets organisasjon.

   Alle stier begynner med /v1. Basis-URL-en har ingen egen prefiks, så
   ikke legg til /v1 to ganger.
   ═══════════════════════════════════════════════════════════ */

const BASIS = 'https://api.supabase.com'

/**
 * Alle 15 tilstandene et Supabase-prosjekt kan ha.
 *
 * Grunnen til at hele lista står her og ikke bare de tre man ser til
 * daglig: PAUSING, RESTORING og UPGRADING er nettopp de tilstandene man
 * trenger å se, og en `default`-gren som skriver «ukjent» ville skjult
 * dem bak samme melding som et manglende token.
 */
export type ProsjektStatus =
  | 'ACTIVE_HEALTHY'
  | 'ACTIVE_UNHEALTHY'
  | 'COMING_UP'
  | 'GOING_DOWN'
  | 'INACTIVE'
  | 'INIT_FAILED'
  | 'PAUSE_FAILED'
  | 'PAUSING'
  | 'REMOVED'
  | 'RESIZING'
  | 'RESTARTING'
  | 'RESTORE_FAILED'
  | 'RESTORING'
  | 'UPGRADING'
  | 'UNKNOWN'

export type SupabaseProsjekt = {
  ref: string
  navn: string
  region: string
  status: ProsjektStatus
  opprettet: string
  /*
   * Slug, ikke id. Både `id` og `organization_id` er merket utfaset i
   * Supabase sitt eget skjema, med «Use `ref` instead» og «Use
   * `organization_slug` instead». De ligger fortsatt i svaret, men skal
   * ikke lagres som nøkler noe sted.
   */
  organisasjonSlug: string
  databaseVert: string | null
  postgresVersjon: string | null
}

/** Tjenestene helsesjekken dekker. */
export const TJENESTER = ['auth', 'db', 'rest', 'realtime', 'storage'] as const
export type Tjeneste = (typeof TJENESTER)[number]

/**
 * MERK at `status` – ikke `healthy` – er det feltet som skal brukes.
 *
 * Boolean-en `healthy` er merket utfaset i Supabase sitt skjema, med
 * teksten «Deprecated. Use `status` instead.» Den er dessuten dårligere:
 * den kollapser tre tilstander til to, slik at en tjeneste som starter
 * opp ser identisk ut med en som er nede.
 */
export type TjenesteHelse = {
  navn: string
  status: 'ACTIVE_HEALTHY' | 'COMING_UP' | 'UNHEALTHY'
  feil: string | null
}

export function supabaseApiKlar(): { klar: boolean; grunn?: string } {
  if (!env.SUPABASE_MANAGEMENT_TOKEN) {
    return {
      klar: false,
      grunn:
        'SUPABASE_MANAGEMENT_TOKEN er ikke satt. Lag et token på supabase.com/dashboard/account/tokens.',
    }
  }
  return { klar: true }
}

function ikkeSattOpp<T>(): HentResultat<T> {
  return {
    ok: false,
    svartidMs: 0,
    feil: {
      slag: 'avvist',
      melding: supabaseApiKlar().grunn ?? 'Ikke satt opp.',
    },
  }
}

/** Alle prosjekter tokenet ser. Grunnlaget for «hvor har jeg databasene mine». */
export async function hentSupabaseProsjekter(): Promise<
  HentResultat<SupabaseProsjekt[]>
> {
  if (!env.SUPABASE_MANAGEMENT_TOKEN) return ikkeSattOpp()

  const svar = await hentJson<
    {
      ref: string
      name: string
      region: string
      status: ProsjektStatus
      created_at: string
      organization_slug: string
      database?: { host: string; version: string }
    }[]
  >(`${BASIS}/v1/projects`, { token: env.SUPABASE_MANAGEMENT_TOKEN })

  if (!svar.ok) return svar

  return {
    ok: true,
    svartidMs: svar.svartidMs,
    data: svar.data.map((p) => ({
      ref: p.ref,
      navn: p.name,
      region: p.region,
      status: p.status,
      opprettet: p.created_at,
      organisasjonSlug: p.organization_slug,
      databaseVert: p.database?.host ?? null,
      postgresVersjon: p.database?.version ?? null,
    })),
  }
}

/**
 * Helsesjekk per tjeneste for ett prosjekt.
 *
 * `services` er påkrevd – uten den svarer API-et med valideringsfeil,
 * ikke med alle tjenestene. `timeout_ms` settes lavt fordi adminbordet
 * spør flere prosjekter samtidig: ett prosjekt som henger skal ikke
 * bruke opp hele tidsfristen for hele oversikten.
 */
export async function hentProsjektHelse(
  ref: string,
): Promise<HentResultat<TjenesteHelse[]>> {
  if (!env.SUPABASE_MANAGEMENT_TOKEN) return ikkeSattOpp()

  const url = new URL(`${BASIS}/v1/projects/${encodeURIComponent(ref)}/health`)
  url.searchParams.set('services', TJENESTER.join(','))
  url.searchParams.set('timeout_ms', '3000')

  const svar = await hentJson<
    {
      name: string
      status: 'ACTIVE_HEALTHY' | 'COMING_UP' | 'UNHEALTHY'
      error?: string
    }[]
  >(url.toString(), { token: env.SUPABASE_MANAGEMENT_TOKEN })

  if (!svar.ok) return svar
  return {
    ok: true,
    svartidMs: svar.svartidMs,
    data: svar.data.map((t) => ({
      navn: t.name,
      status: t.status,
      feil: t.error ?? null,
    })),
  }
}

/**
 * Kjører en lesespørring i prosjektet, uten at vi trenger noen nøkkel.
 *
 * Dette er grunnen til at adminbordet kan telle brukere og rader i sju
 * databaser uten å oppbevare sju service role-nøkler. Spørringen kjøres
 * som en egen lesebruker, så en skrivefeil her kan ikke ødelegge data.
 *
 * MERK: alle tabellnavn må være skjemakvalifiserte. `select count(*)
 * from users` feiler; `from auth.users` virker. Og svaret er 201, ikke
 * 200 – hentJson bryr seg ikke, men det overrasker hvis man feilsøker
 * med curl.
 */
export async function lesSpørring<T = Record<string, unknown>>(
  ref: string,
  spørring: string,
): Promise<HentResultat<T[]>> {
  if (!env.SUPABASE_MANAGEMENT_TOKEN) return ikkeSattOpp()

  return hentJson<T[]>(
    `${BASIS}/v1/projects/${encodeURIComponent(ref)}/database/query/read-only`,
    {
      token: env.SUPABASE_MANAGEMENT_TOKEN,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: spørring }),
    },
  )
}

export type Diskbruk = {
  brukteBytes: number
  ledigeBytes: number
  totaltBytes: number
  /** Andel brukt, 0–1. Utregnet her så visningen ikke må gjøre det tre steder. */
  andelBrukt: number
}

/**
 * Diskbruk for prosjektet.
 *
 * MERK at dette er filsystemet, ikke `pg_database_size`. WAL, logger og
 * Postgres sitt eget overhead er med, så tallet er høyere enn summen av
 * tabellene. Det er likevel det riktige tallet å vise, for det er dette
 * som fyller opp og pauser prosjektet.
 */
export async function hentDiskbruk(
  ref: string,
): Promise<HentResultat<Diskbruk>> {
  if (!env.SUPABASE_MANAGEMENT_TOKEN) return ikkeSattOpp()

  const svar = await hentJson<{
    metrics: {
      fs_size_bytes: number
      fs_avail_bytes: number
      fs_used_bytes: number
    }
  }>(`${BASIS}/v1/projects/${encodeURIComponent(ref)}/config/disk/util`, {
    token: env.SUPABASE_MANAGEMENT_TOKEN,
  })

  if (!svar.ok) return svar

  const m = svar.data.metrics
  return {
    ok: true,
    svartidMs: svar.svartidMs,
    data: {
      brukteBytes: m.fs_used_bytes,
      ledigeBytes: m.fs_avail_bytes,
      totaltBytes: m.fs_size_bytes,
      // Deler på fs_size_bytes, ikke used+avail: reservert plass hører
      // med i totalen, ellers viser gauget 100 % før disken er full.
      andelBrukt: m.fs_size_bytes > 0 ? m.fs_used_bytes / m.fs_size_bytes : 0,
    },
  }
}

export type ProsjektNøkkel = {
  navn: string
  slag: 'legacy' | 'publishable' | 'secret' | null
  /** Kun satt når `reveal=true` fikk lov. */
  verdi: string | null
}

/**
 * Henter prosjektets API-nøkler.
 *
 * `reveal=true` er nødvendig – uten den kommer nøklene maskert, og da
 * ser det ut som om prosjektet ikke har noen. Bare `name` er garantert
 * i svaret, så alt annet må sjekkes før bruk.
 *
 * Brukes til å fylle inn service role-nøkkelen automatisk når et system
 * legges til, i stedet for at den må hentes manuelt fra konsollet.
 */
export async function hentProsjektNøkler(
  ref: string,
): Promise<HentResultat<ProsjektNøkkel[]>> {
  if (!env.SUPABASE_MANAGEMENT_TOKEN) return ikkeSattOpp()

  const url = new URL(`${BASIS}/v1/projects/${encodeURIComponent(ref)}/api-keys`)
  url.searchParams.set('reveal', 'true')

  const svar = await hentJson<
    {
      name: string
      type?: 'legacy' | 'publishable' | 'secret' | null
      api_key?: string | null
    }[]
  >(url.toString(), { token: env.SUPABASE_MANAGEMENT_TOKEN })

  if (!svar.ok) return svar
  return {
    ok: true,
    svartidMs: svar.svartidMs,
    data: svar.data.map((n) => ({
      navn: n.name,
      slag: n.type ?? null,
      verdi: n.api_key ?? null,
    })),
  }
}

/**
 * Plukker service role-nøkkelen ut av nøkkellista.
 *
 * De gamle JWT-nøklene kommer som type 'legacy' for både anon og
 * service_role, så typen alene skiller dem ikke – navnet må brukes.
 * De nye kalles 'secret'.
 */
export function finnServiceRole(nøkler: ProsjektNøkkel[]): string | null {
  const treff =
    nøkler.find((n) => n.navn === 'service_role' && n.verdi) ??
    nøkler.find((n) => n.slag === 'secret' && n.verdi)
  return treff?.verdi ?? null
}

export function finnAnon(nøkler: ProsjektNøkkel[]): string | null {
  const treff =
    nøkler.find((n) => n.navn === 'anon' && n.verdi) ??
    nøkler.find((n) => n.slag === 'publishable' && n.verdi)
  return treff?.verdi ?? null
}

import { hentJson, type HentResultat } from './hent'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Supabase Management API.

   Hver funksjon tar tokenet som argument framfor å lese det fra miljøet.
   Grunnen er at systemene ligger under FIRE ulike Supabase-innlogginger,
   og et personal access token rekker bare prosjekter i organisasjoner
   den kontoen er med i. Ett token kan altså ikke se alt, og hvilket som
   gjelder avhenger av hvilket system det spørres om.

   Se src/lib/kontoar.ts for oppslaget. Der ligger også fallbacken til
   SUPABASE_MANAGEMENT_TOKEN, for systemer uten registrert konto.

   Med et token som rekker fram kan vi lese prosjektstatus, kjøre
   lesespørringer OG hente prosjektets egne nøkler – da må ingenting
   limes inn manuelt. Tabellen `hemmeligheter` er reserve for prosjekter
   der ingen token rekker.

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

/**
 * Meldingen når et system ikke har noe token å bruke.
 *
 * Nevner både kontoen og miljøvariabelen, fordi begge er gyldige veier
 * og den som leser feilen ellers ikke vet hvilken som mangler. Systemene
 * ligger under fire ulike Supabase-innlogginger, så «legg inn et token»
 * er ikke presist nok – det må være tokenet for RIKTIG konto.
 */
export const INGEN_TOKEN =
  'Ingen Supabase-token for kontoen som eier dette prosjektet. Legg inn et personal access token for den kontoen på /innstillinger, eller sett SUPABASE_MANAGEMENT_TOKEN.'

export function supabaseApiKlar(token: string | null): {
  klar: boolean
  grunn?: string
} {
  return token ? { klar: true } : { klar: false, grunn: INGEN_TOKEN }
}

function ikkeSattOpp<T>(grunn: string = INGEN_TOKEN): HentResultat<T> {
  return {
    ok: false,
    svartidMs: 0,
    feil: { slag: 'avvist', melding: grunn },
  }
}

/** Alle prosjekter tokenet ser. Grunnlaget for «hvor har jeg databasene mine». */
export async function hentSupabaseProsjekter(token: string | null): Promise<
  HentResultat<SupabaseProsjekt[]>
> {
  if (!token) return ikkeSattOpp()

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
  >(`${BASIS}/v1/projects`, { token })

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
  token: string | null,
  ref: string,
): Promise<HentResultat<TjenesteHelse[]>> {
  if (!token) return ikkeSattOpp()

  const url = new URL(`${BASIS}/v1/projects/${encodeURIComponent(ref)}/health`)
  url.searchParams.set('services', TJENESTER.join(','))
  url.searchParams.set('timeout_ms', '3000')

  const svar = await hentJson<
    {
      name: string
      status: 'ACTIVE_HEALTHY' | 'COMING_UP' | 'UNHEALTHY'
      error?: string
    }[]
  >(url.toString(), { token })

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
  token: string | null,
  ref: string,
  spørring: string,
): Promise<HentResultat<T[]>> {
  if (!token) return ikkeSattOpp()

  return hentJson<T[]>(
    `${BASIS}/v1/projects/${encodeURIComponent(ref)}/database/query/read-only`,
    {
      token,
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
  token: string | null,
  ref: string,
): Promise<HentResultat<Diskbruk>> {
  if (!token) return ikkeSattOpp()

  const svar = await hentJson<{
    metrics: {
      fs_size_bytes: number
      fs_avail_bytes: number
      fs_used_bytes: number
    }
  }>(`${BASIS}/v1/projects/${encodeURIComponent(ref)}/config/disk/util`, {
    token,
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

/** Dager uten trafikk før Supabase pauser et gratisprosjekt. */
export const PAUSEGRENSE_DAGER = 7

export type Aktivitet = {
  /** Siste døgn med trafikk, ISO-dato. Null når det ikke var noe på sju dager. */
  sisteAktivitet: string | null
  /** Hele døgn siden da. Null når vi ikke vet. */
  dagerSiden: number | null
  /**
   * Anslåtte dager til Supabase pauser prosjektet.
   *
   * ANSLAG, ikke et løfte. Supabase sier «pauses etter én uke uten
   * aktivitet» uten å definere presist hva som teller som aktivitet – vi
   * regner på API-forespørsler, som er det vi kan se. Negativt eller null
   * betyr at grensen er passert, og at prosjektet enten alt er pauset
   * eller er på vei.
   */
  dagerTilPause: number | null
  /** Trafikk per døgn, nyeste sist. Bare døgn MED trafikk er med. */
  perDøgn: { dato: string; forespørsler: number }[]
}

/**
 * Når hadde databasen sist trafikk?
 *
 * Dette er varselet før appen går ned: et gratisprosjekt uten trafikk i
 * sju døgn blir pauset, og da svarer det ikke på noe. Statusen sier
 * ACTIVE_HEALTHY helt til det skjer, så uten dette tallet er det ingen
 * forvarsel – bare en app som plutselig er død.
 *
 * MERK at API-et bare returnerer døgn MED trafikk. Tomme døgn er ikke
 * nuller i lista, de mangler. Derfor er siste element i `result` det
 * siste døgnet noe skjedde, og ikke nødvendigvis i dag.
 */
export async function hentAktivitet(
  token: string | null,
  ref: string,
): Promise<HentResultat<Aktivitet>> {
  if (!token) return ikkeSattOpp()

  const url = new URL(
    `${BASIS}/v1/projects/${encodeURIComponent(ref)}/analytics/endpoints/usage.api-counts`,
  )
  url.searchParams.set('interval', '7day')

  const svar = await hentJson<{
    result?: {
      timestamp: string
      total_auth_requests: number
      total_realtime_requests: number
      total_rest_requests: number
      total_storage_requests: number
    }[]
    // Dette endepunktet kan svare 200 med en feil i kroppen. Sjekkes under.
    error?: string | { message?: string } | null
  }>(url.toString(), { token })

  if (!svar.ok) return svar

  if (svar.data.error) {
    const melding =
      typeof svar.data.error === 'string'
        ? svar.data.error
        : (svar.data.error.message ?? 'Ukjent feil fra analysedata')
    return {
      ok: false,
      svartidMs: svar.svartidMs,
      feil: { slag: 'ugyldig_svar', melding },
    }
  }

  const perDøgn = (svar.data.result ?? [])
    .map((r) => ({
      dato: r.timestamp,
      forespørsler:
        r.total_auth_requests +
        r.total_realtime_requests +
        r.total_rest_requests +
        r.total_storage_requests,
    }))
    .filter((r) => r.forespørsler > 0)
    .sort((a, b) => a.dato.localeCompare(b.dato))

  const siste = perDøgn.at(-1) ?? null
  const dagerSiden = siste
    ? Math.floor(
        (Date.now() - new Date(siste.dato).getTime()) / (24 * 60 * 60 * 1000),
      )
    : null

  return {
    ok: true,
    svartidMs: svar.svartidMs,
    data: {
      sisteAktivitet: siste?.dato ?? null,
      dagerSiden,
      dagerTilPause: dagerSiden === null ? null : PAUSEGRENSE_DAGER - dagerSiden,
      perDøgn,
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
  token: string | null,
  ref: string,
): Promise<HentResultat<ProsjektNøkkel[]>> {
  if (!token) return ikkeSattOpp()

  const url = new URL(`${BASIS}/v1/projects/${encodeURIComponent(ref)}/api-keys`)
  url.searchParams.set('reveal', 'true')

  const svar = await hentJson<
    {
      name: string
      type?: 'legacy' | 'publishable' | 'secret' | null
      api_key?: string | null
    }[]
  >(url.toString(), { token })

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

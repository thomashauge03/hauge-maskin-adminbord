/* ═══════════════════════════════════════════════════════════
   Domenetyper. Speiler kolonnene i supabase/migrations/0001_init.sql.

   Skrevet for hånd i stedet for generert fra databasen, fordi de
   genererte typene beskriver hver kolonne som `| null` og gjør at
   halve appen må sjekke felt som i praksis alltid finnes. Endres
   skjemaet, endres denne fila i samme commit.
   ═══════════════════════════════════════════════════════════ */

// ── Adminbordets egne brukere ─────────────────────────────────

/** 'eier' kan alt. 'drift' ser status, men ikke nøkler eller brukere. */
export type AdminRolle = 'eier' | 'drift'

export type AdminBruker = {
  id: string
  navn: string
  epost: string
  rolle: AdminRolle
  aktiv: boolean
  maByttePassord: boolean
}

// ── Systemregisteret ──────────────────────────────────────────

export type System = {
  id: string
  slug: string
  navn: string
  beskrivelse: string | null
  /**
   * Supabase-kontoen som eier prosjektet.
   *
   * Avgjør hvilket management-token som gjelder. Null betyr at systemet
   * faller tilbake på SUPABASE_MANAGEMENT_TOKEN – som for de fleste av
   * disse systemene ikke rekker fram, siden de ligger under fire ulike
   * innlogginger.
   */
  kontoId: string | null
  supabaseProsjektRef: string | null
  supabaseUrl: string | null
  vercelProsjektId: string | null
  vercelProsjektNavn: string | null
  githubRepo: string | null
  produksjonsUrl: string | null
  sortering: number
  aktiv: boolean
  overvakes: boolean
  notat: string | null
  opprettet: string
  endret: string
}

// ── Status ────────────────────────────────────────────────────

export type Kilde = 'supabase' | 'vercel' | 'nettside'

/**
 * Fire tilstander, ikke to.
 *
 * 'ukjent' er den viktigste: den skiller «vi har sjekket og det er
 * nede» fra «vi klarte ikke sjekke». Uten den ville et manglende token
 * sett ut som et nedetidsvarsel, og da mister varslene troverdighet.
 * 'advarsel' dekker det som virker men ikke er som det skal – en pauset
 * database, et bygg som feilet mens forrige versjon fortsatt kjører.
 */
export type Tilstand = 'ok' | 'advarsel' | 'nede' | 'ukjent'

export type StatusMaaling = {
  id: number
  systemId: string
  kilde: Kilde
  tilstand: Tilstand
  melding: string | null
  detaljer: Record<string, unknown>
  svartidMs: number | null
  maltTid: string
}

/** Én kildes ferske svar, før det er lagret. */
export type Maaling = {
  kilde: Kilde
  tilstand: Tilstand
  melding: string | null
  detaljer: Record<string, unknown>
  svartidMs: number
  /*
   * Satt når det live-kallet feilet og vi viser siste lagrede måling i
   * stedet. Verdien er tidspunktet målingen ble gjort, og visningen MÅ
   * vise den – «Pauset» uten alder er en påstand om nåtiden vi ikke kan
   * stå for. Null betyr at målingen er fersk.
   */
  fraLager?: string | null
}

/** Et system med alt som skal vises på oversikten. */
export type SystemStatus = {
  system: System
  maalinger: Maaling[]
  /** Verste tilstand blant målingene – det oversikten sorterer på. */
  samletTilstand: Tilstand
}

// ── Hemmeligheter ─────────────────────────────────────────────

export type HemmelighetSlag = 'service_role' | 'anon' | 'annet'

/** Slik en hemmelighet vises. Selve verdien forlater aldri serveren. */
export type Hemmelighet = {
  id: string
  systemId: string
  slag: HemmelighetSlag
  navn: string
  hint: string
  opprettet: string
  endret: string
}

// ── Identitetsnavet ───────────────────────────────────────────

export type Person = {
  id: string
  navn: string
  epost: string
  telefon: string | null
  aktiv: boolean
  navBrukerId: string | null
  notat: string | null
}

export type SystemTilgang = {
  id: string
  personId: string
  systemId: string
  rolle: string
  eksternBrukerId: string | null
  aktiv: boolean
  sistBekreftet: string | null
}

/** En bruker slik den finnes i et annet systems auth.users. */
export type EksternBruker = {
  id: string
  epost: string | null
  opprettet: string
  sistInnlogget: string | null
  epostBekreftet: boolean
  /** Rollen slik det systemet selv kaller den, når vi klarer lese den. */
  rolleISystem: string | null
  aktivISystem: boolean | null
}

// ── Hendelseslogg ─────────────────────────────────────────────

export type Hendelse = {
  id: number
  utfortAvEpost: string | null
  handling: string
  systemId: string | null
  detaljer: Record<string, unknown>
  tid: string
}

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
  /**
   * Supabase-innloggingen prosjektet ligger under.
   *
   * Vises på kortet fordi det er svaret på «hvor logger jeg inn for å
   * gjøre noe med dette». Med fire kontoer er det ikke opplagt, og å måtte
   * slå det opp hver gang er nettopp det adminbordet skal fjerne.
   */
  kontoEpost: string | null
  /**
   * Hvor lenge siden databasen hadde trafikk, og hvor nær en pause den er.
   *
   * Null når vi ikke kunne måle det – prosjektet mangler token, er alt
   * pauset, eller har ingen database.
   */
  aktivitet: {
    sisteAktivitet: string | null
    dagerSiden: number | null
    dagerTilPause: number | null
  } | null
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

/**
 * Én person i ett annet system, sett fra BEGGE sider.
 *
 * Het før EksternBruker og hadde bare kontosiden – `rolleISystem` sto der,
 * men ble aldri fylt. Konsekvensen var at matrisen på /brukere viste en grønn
 * «JA» for alle med en rad i auth.users, altså for alle med en KONTO, og kalte
 * det tilgang. Se src/lib/tilgangslesning.ts for hva det ga i praksis.
 *
 * De to sidene er uavhengige, og det er poenget: en konto uten tilgangsrad er
 * en person som kan logge inn og ikke se noe, mens en tilgangsrad uten konto er
 * en person som er invitert men aldri har registrert seg. Begge er normale, og
 * begge var usynlige.
 */
/**
 * Én vei tilgangen kom fra.
 *
 * Flere veier per person er normalt: i tilbudssystemet kan man være medlem av
 * Hauge Maskin OG plattform-admin gjennom en annen kunde, og i lager-appene
 * gir kontoen full tilgang mens `super_admins` gir brukeradministrasjonen i
 * tillegg. Å slå dem sammen til én rolle ville skjult hvilken makt som
 * kommer hvorfra.
 */
export type Tilgangsvei = {
  etikett: string
  rolle: string | null
  aktiv: boolean | null
}

export type TilgangsRad = {
  /** Null bare for auth-nøklede systemer der tilgangsraden peker på en id som
      ikke finnes i auth.users – en foreldreløs rad. */
  epost: string | null
  authId: string | null

  // ── Kontosiden (auth.users) ──
  harKonto: boolean
  /** false = sperret med banned_until. Null når det ikke er noen konto å måle,
      eller når kilden ikke oppgir sperring. */
  kontoAktiv: boolean | null
  epostBekreftet: boolean | null
  opprettet: string | null
  sistInnlogget: string | null

  // ── Tilgangssiden (systemets egen rolletabell) ──
  /**
   * Null betyr «vet ikke», ikke «nei».
   *
   * Settes for systemer uten tilgangsoppsett: da kjenner adminbordet ingen
   * rolletabell å spørre, og «ingen tilgang» ville vært en påstand vi ikke kan
   * stå for. Skillet mellom nei og vet-ikke er grunnen til at feltet ikke er
   * en enkel boolean.
   */
  harTilgang: boolean | null
  /** Hver vei tilgangen kom fra. Tom når personen ikke har tilgang. */
  veier: Tilgangsvei[]
  /** Den første rollen blant veiene, til den korte visningen i matrisen.
      `veier` er hele svaret; dette er sammendraget. */
  rolle: string | null
  /** Systemets EGEN aktiv-kolonne, som er noe annet enn Supabase-sperring.
      Utleie kan ha aktiv=false på en konto som ikke er sperret. */
  tilgangAktiv: boolean | null
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

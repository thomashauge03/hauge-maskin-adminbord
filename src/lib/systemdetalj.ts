import type { System } from '@/lib/typer'
import {
  hentDiskbruk,
  hentProsjektHelse,
  lesSpørring,
  type Diskbruk,
  type TjenesteHelse,
} from '@/lib/plattform/supabase-api'
import {
  hentDeployHistorikk,
  hentDomener,
  type Deploy,
} from '@/lib/plattform/vercel'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Detaljene for ett system. Hentes bare på systemsiden, der noen har
   bedt om dem – oversikten klarer seg med to kall totalt, mens denne
   gjør seks. Det er greit her: man ser på ett system om gangen.
   ═══════════════════════════════════════════════════════════ */

export type Tabellrad = { tabell: string; rader: number }

export type Databasedetalj = {
  tjenester: TjenesteHelse[] | null
  tjenesterFeil: string | null
  disk: Diskbruk | null
  diskFeil: string | null
  /** Antall rader i auth.users. Null når spørringen ikke gikk. */
  brukere: number | null
  brukereSiste30: number | null
  logiskStørrelse: number | null
  tabeller: Tabellrad[] | null
  spørringFeil: string | null
}

/**
 * Alle tabellnavn er skjemakvalifiserte, også de i pg_catalog.
 *
 * Management-API-et sier eksplisitt at referanser må kvalifiseres, og en
 * lesebruker har ikke nødvendigvis samme search_path som en vanlig
 * tilkobling. `from pg_stat_user_tables` feiler; `from
 * pg_catalog.pg_stat_user_tables` gjør det ikke.
 */
const SPØRRING_NØKKELTALL = `
  select
    (select count(*) from auth.users) as brukere,
    (select count(*) from auth.users
      where last_sign_in_at > now() - interval '30 days') as brukere_siste_30,
    pg_catalog.pg_database_size(pg_catalog.current_database()) as storrelse
`

/*
 * n_live_tup er Postgres sitt eget anslag, ikke en count(*).
 * Det er med vilje: en count(*) på tolv tabeller i en produksjonsbase
 * kan ta sekunder og låse lesing, og til «hvor mye ligger her» er et
 * anslag på noen hundre rader godt nok.
 */
const SPØRRING_TABELLER = `
  select relname as tabell, n_live_tup as rader
  from pg_catalog.pg_stat_user_tables
  where schemaname = 'public'
  order by n_live_tup desc
  limit 20
`

export async function hentDatabasedetalj(
  prosjektRef: string,
): Promise<Databasedetalj> {
  // Alle fire startes samtidig. Etter hverandre ville siden brukt
  // summen av tidsfristene – over tretti sekunder i verste fall.
  const [helse, disk, nøkkeltall, tabeller] = await Promise.all([
    hentProsjektHelse(prosjektRef),
    hentDiskbruk(prosjektRef),
    lesSpørring<{
      brukere: string | number
      brukere_siste_30: string | number
      storrelse: string | number
    }>(prosjektRef, SPØRRING_NØKKELTALL),
    lesSpørring<{ tabell: string; rader: string | number }>(
      prosjektRef,
      SPØRRING_TABELLER,
    ),
  ])

  // Postgres sender bigint som streng i JSON, fordi tallene kan være
  // større enn et JavaScript-tall takler. Number() på en count er trygt.
  const rad = nøkkeltall.ok ? nøkkeltall.data[0] : undefined

  return {
    tjenester: helse.ok ? helse.data : null,
    tjenesterFeil: helse.ok ? null : helse.feil.melding,
    disk: disk.ok ? disk.data : null,
    diskFeil: disk.ok ? null : disk.feil.melding,
    brukere: rad ? Number(rad.brukere) : null,
    brukereSiste30: rad ? Number(rad.brukere_siste_30) : null,
    logiskStørrelse: rad ? Number(rad.storrelse) : null,
    tabeller: tabeller.ok
      ? tabeller.data.map((t) => ({ tabell: t.tabell, rader: Number(t.rader) }))
      : null,
    spørringFeil: nøkkeltall.ok
      ? tabeller.ok
        ? null
        : tabeller.feil.melding
      : nøkkeltall.feil.melding,
  }
}

export type Utrullingsdetalj = {
  deployer: Deploy[] | null
  deployerFeil: string | null
  domener: { navn: string; bekreftet: boolean }[] | null
  domenerFeil: string | null
}

export async function hentUtrullingsdetalj(
  system: System,
): Promise<Utrullingsdetalj> {
  // Domenelisten krever prosjekt-ID; navnet holder ikke på den ruten.
  const id = system.vercelProsjektId ?? system.vercelProsjektNavn
  if (!id) {
    return {
      deployer: null,
      deployerFeil: 'Ingen Vercel-prosjekt registrert.',
      domener: null,
      domenerFeil: null,
    }
  }

  const [historikk, domener] = await Promise.all([
    hentDeployHistorikk(id, 10),
    hentDomener(id),
  ])

  return {
    deployer: historikk.ok ? historikk.data : null,
    deployerFeil: historikk.ok ? null : historikk.feil.melding,
    domener: domener.ok ? domener.data : null,
    domenerFeil: domener.ok ? null : domener.feil.melding,
  }
}

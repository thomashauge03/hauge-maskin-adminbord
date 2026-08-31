import {
  finnAnon,
  hentProsjektNøkler,
  lesSpørring,
} from '@/lib/plattform/supabase-api'
import 'server-only'

/* ═══════════════════════════════════════════════════════════
   Livstegn til en database, slik at den ikke pauses.

   Et gratisprosjekt uten trafikk i sju døgn blir pauset, og da er appen nede.

   HVORFOR DETTE IKKE ER ET HELSEKALL. Første versjon sendte
   `GET /auth/v1/health` og meldte «pause-klokka er nullstilt» på HTTP 200.
   Påstanden var feil, og målt mot virkeligheten:

     utleie   klikk 2026-08-26 kl 13:01, HTTP 200, loggført
              trafikkbøtta for 2026-08-26: auth=1 rest=0
              status noen dager senere: INACTIVE

   Helsekallet er GoTrue som svarer «jeg lever». Det rører ALDRI databasen.
   Mønsteret på tvers av alle åtte prosjekt er entydig: hvert prosjekt som har
   holdt seg oppe har `rest > 0`, hvert prosjekt som ble pauset hadde bare
   `auth`.

   Derfor to kall som begge treffer Postgres:
     1. `select 1` gjennom Management-API-et. Åpner en ekte forbindelse og
        kjører SQL – beviser at basen svarer.
     2. Et anon-kall mot PostgREST med `limit=0`. Går gjennom Kong til
        PostgREST til Postgres, og teller som `rest`.

   Nummer 2 er den som antas å nullstille klokka, fordi det er trafikktypen de
   levende prosjektene har. Det er en SLUTNING fra observasjon, ikke noe
   Supabase dokumenterer – og kallstedene sier det, framfor å love noe vi ikke
   kan stå for. Det var nettopp den overtroen som gjorde at forrige versjon så
   ut til å virke i to uker.

   Delt fil fordi BÅDE knappen og cron-en trenger den. Cron-en er den som
   faktisk holder prosjektene i live: en knapp hjelper bare den dagen noen
   husker å trykke.
   ═══════════════════════════════════════════════════════════ */

export type Livstegn = {
  /** Svarte databasen på `select 1`. Er denne false, er basen sannsynligvis
      alt pauset – og da hjelper ingen trafikk. */
  basenSvarte: boolean
  /** Gikk rest-kallet gjennom til Postgres. Dette er det som teller. */
  restNåddeFram: boolean
  /** Ser prosjektet pauset ut, altså nektes forbindelser. */
  serPausetUt: boolean
  /** Hva som faktisk skjedde, linje for linje. Vises i grensesnittet. */
  linjer: string[]
}

/** `limit=0`: spørringen kjøres, men ingen rader krysser nettet. Vi vil ha et
    databasetreff, ikke data. */
const GRENSE = 'select=*&limit=0'

/**
 * Finner en tabell som finnes, og som anon helst kan lese.
 *
 * Et 404 fra PostgREST rører aldri Postgres, så tabellnavnet må være ekte.
 * Tabeller med en anon- eller public-policy foretrekkes, slik at svaret blir
 * 200 framfor 401 – men et 401 med Postgres-koden 42501 betyr også at
 * spørringen NÅDDE basen, så begge duger.
 */
const SPØRRING_TABELL = `
  select t.tablename as navn
    from pg_tables t
   where t.schemaname = 'public'
   order by exists (
     select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = t.tablename
        and p.cmd in ('SELECT', 'ALL')
        and (p.roles::text like '%anon%' or p.roles::text like '%public%')
   ) desc, t.tablename
   limit 1
`

export async function sendLivstegn(
  token: string,
  ref: string,
  /**
   * Tabell å bruke når oppdagelsen ikke går.
   *
   * Finnes fordi qr-admin ikke kan spørres med SQL i det hele tatt:
   * `supabase_read_only_user` får «28P01 password authentication failed» der.
   * Uten en oppgitt tabell er prosjektet uten livstegn, selv om REST-veien –
   * som ikke bruker den brukeren – ville virket fint.
   */
  oppgittTabell?: string | null,
): Promise<Livstegn> {
  const linjer: string[] = []

  // ── 1. Databasen selv ──
  const sql = await lesSpørring<{ svar: number }>(token, ref, 'select 1 as svar')
  const pausetSignatur =
    !sql.ok && /timeout|terminated|ECONNREFUSED|ENOTFOUND/i.test(sql.feil.melding)

  if (pausetSignatur) {
    linjer.push(`select 1 → FEILET: ${sql.feil.melding}`)
    return { basenSvarte: false, restNåddeFram: false, serPausetUt: true, linjer }
  }

  /*
   * En FEILET select 1 som ikke er en pause stopper oss ikke.
   *
   * Første utgave returnerte her, og da sto qr-admin uten livstegn på grunn av
   * et ødelagt passord for lesebrukeren – mens rest-veien, som er den som
   * teller, ville gått fint. Å gi opp fordi det ene av to kall feilet er å
   * gjøre en delvis feil til en total.
   */
  if (!sql.ok) {
    linjer.push(
      `select 1 → FEILET: ${sql.feil.melding} – prøver rest-veien likevel, den bruker ikke lesebrukeren`,
    )
  } else {
    linjer.push(
      `select 1 → svarte ${sql.data[0]?.svar ?? '?'} på ${sql.svartidMs} ms (databasen er oppe)`,
    )
  }

  // ── 2. Anon-nøkkelen ──
  const nøkler = await hentProsjektNøkler(token, ref)
  const anon = nøkler.ok ? finnAnon(nøkler.data) : null
  if (!anon) {
    linjer.push(
      nøkler.ok
        ? 'Fant ingen lesbar anon-nøkkel – er de gamle JWT-nøklene slått av?'
        : `Kunne ikke hente anon-nøkkelen: ${nøkler.feil.melding}`,
    )
    return {
      basenSvarte: sql.ok,
      restNåddeFram: false,
      serPausetUt: false,
      linjer,
    }
  }

  // ── 3. En tabell som finnes ──
  // Oppgitt tabell vinner: den er satt nettopp fordi oppdagelsen ikke virker.
  let navn = oppgittTabell?.trim() || null
  if (navn) {
    linjer.push(`Bruker tabellen «${navn}» fra registeret`)
  } else {
    const tabell = await lesSpørring<{ navn: string }>(token, ref, SPØRRING_TABELL)
    navn = tabell.ok ? (tabell.data[0]?.navn ?? null) : null
  }

  if (!navn) {
    linjer.push(
      'Fant ingen tabell i public, og ingen er oppgitt i registeret – kan ikke sende rest-kallet. Sett «livstegn-tabell» på systemet.',
    )
    return {
      basenSvarte: sql.ok,
      restNåddeFram: false,
      serPausetUt: false,
      linjer,
    }
  }

  // ── 4. Selve trafikken ──
  const start = Date.now()
  try {
    const r = await fetch(
      `https://${ref}.supabase.co/rest/v1/${encodeURIComponent(navn)}?${GRENSE}`,
      {
        headers: { apikey: anon, Authorization: `Bearer ${anon}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      },
    )
    const kropp = await r.text().catch(() => '')
    // 42501 er Postgres sin «permission denied». Kommer den, har spørringen
    // vært innom basen – og det er treffet vi er ute etter.
    const nådde = r.ok || kropp.includes('42501')
    linjer.push(
      `GET /rest/v1/${navn}?limit=0 → HTTP ${r.status} på ${Date.now() - start} ms${
        nådde
          ? r.ok
            ? ' · spørringen kjørte'
            : ' · Postgres svarte 42501 (RLS blokkerte radene, men basen ble truffet)'
          : ` · ${kropp.slice(0, 120)}`
      }`,
    )
    return {
      basenSvarte: sql.ok,
      restNåddeFram: nådde,
      serPausetUt: false,
      linjer,
    }
  } catch (e) {
    linjer.push(`rest-kallet feilet: ${e instanceof Error ? e.message : 'ukjent'}`)
    return {
      basenSvarte: sql.ok,
      restNåddeFram: false,
      serPausetUt: false,
      linjer,
    }
  }
}

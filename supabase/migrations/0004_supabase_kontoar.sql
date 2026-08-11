-- ═══════════════════════════════════════════════════════════
-- Supabase-kontoene prosjektene ligger under
--
-- Systemene er fordelt på FIRE ulike Supabase-innlogginger. Det er ikke
-- en detalj, det er en forutsetning som avgjør hva adminbordet kan se:
-- et personal access token rekker bare prosjekter i organisasjoner den
-- kontoen er med i.
--
-- Derfor hører tokenet til KONTOEN, ikke til systemet. To systemer under
-- samme innlogging deler ett token, og en rotasjon er én rad å endre –
-- ikke to som må huskes samtidig.
--
-- Miljøvariabelen SUPABASE_MANAGEMENT_TOKEN beholdes som standard for
-- systemer uten egen konto-rad. Uten den fallbacken måtte alt legges inn
-- i databasen før noe som helst virket, og da er adminbordet ubrukelig
-- første gang det startes.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.supabase_kontoar (
  id uuid primary key default gen_random_uuid(),

  -- Innloggingen hos Supabase. Ikke en bruker i adminbordet – dette er
  -- kontoen som EIER prosjektene.
  epost text not null unique,
  beskrivelse text,

  /*
   * Personal access token for kontoen, kryptert med samme nøkkel som
   * resten. Null betyr «ikke lagt inn ennå»: da faller systemene under
   * kontoen tilbake på miljøvariabelen, og hvis den heller ikke rekker
   * dem, vises de som uvisst med en forklaring.
   *
   * MERK at et PAT ikke kan avgrenses. Det gir full tilgang til hele
   * kontoen, også prosjekter som ikke står i registeret. Det er hele
   * grunnen til at denne tabellen ikke har noen leselig policy.
   */
  token_kryptert text,
  -- Forkortet visning, «sbp_f3…a266». Nok til å kjenne igjen hvilket
  -- token som ligger der, for lite til å bruke det.
  hint text,

  -- Satt når tokenet sist ble brukt med hell, og hvor mange prosjekter
  -- det da så. Gjør det mulig å oppdage et utløpt token før noen lurer
  -- på hvorfor statusen er borte.
  sist_bekreftet timestamptz,
  antall_prosjekter integer,

  opprettet timestamptz not null default now(),
  endret timestamptz not null default now()
);

create trigger supabase_kontoar_endret
  before update on public.supabase_kontoar
  for each row execute function public.sett_endret();

-- Radsikkerhet på, ingen policy. Tabellen holder tokens som gir full
-- tilgang til hele Supabase-kontoer. Leses bare av server-kode som
-- først har kalt krevEier(), på samme måte som `hemmeligheter`.
alter table public.supabase_kontoar enable row level security;


-- ── Kobling fra system til konto ──────────────────────────────
alter table public.systemer
  add column if not exists konto_id uuid
    references public.supabase_kontoar (id) on delete set null;

create index if not exists systemer_konto_idx
  on public.systemer (konto_id);


/*
 * Kontoene og koblingene seedes IKKE her.
 *
 * Radene inneholder e-postadressene til fire private Supabase-
 * innlogginger, og dette repoet er offentlig. En migrasjon med dem i
 * ville publisert hvilke kontoer som eier hvilke produksjonsdatabaser –
 * halve jobben for den som vil prøve seg på en gjenopprettings-e-post.
 *
 * Kjør i stedet det lokale skriptet, eller legg dem inn fra
 * /innstillinger i adminbordet. Formen er:
 *
 *   insert into public.supabase_kontoar (epost, beskrivelse)
 *   values ('<innlogging>', '<hvilke systemer>')
 *   on conflict (epost) do nothing;
 *
 *   update public.systemer set konto_id = (
 *     select id from public.supabase_kontoar where epost = '<innlogging>'
 *   ) where slug in ('<slug>', '<slug>');
 *
 * Tokenene legges inn gjennom grensesnittet, som krypterer dem først.
 */

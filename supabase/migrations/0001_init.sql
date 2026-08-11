-- ═══════════════════════════════════════════════════════════
-- Hauge Maskin Adminbord – grunnskjema
--
-- Adminbordet har sin egen Supabase-database. Den inneholder ingen
-- forretningsdata; den er et register over de andre systemene, en
-- logg over hva som er gjort, og på sikt navet for felles innlogging.
--
-- Kjøres i SQL-editoren i adminbordets Supabase-prosjekt.
-- ═══════════════════════════════════════════════════════════

-- ── Hjelpefunksjon: holder `endret` i takt ────────────────────
-- Uten denne må hver UPDATE i appen huske å sette endret selv, og
-- den ene gangen den glemmes ser raden nyere ut enn den er.
create or replace function public.sett_endret()
returns trigger
language plpgsql
as $$
begin
  new.endret = now();
  return new;
end;
$$;


-- ═══════════════════════════════════════════════════════════
-- ADMINBORDETS EGNE BRUKERE
-- ═══════════════════════════════════════════════════════════

-- Skilt fra `personer` lenger ned med vilje. Dette er de få som får
-- styre alle systemene; `personer` er alle som bruker et av dem.
-- Ville vi slått dem sammen, måtte hver tilgangssjekk i adminbordet
-- lest en rolle ut av en tabell som også fylles opp av vanlige
-- lagerarbeidere – og da er én feil i en policy nok til at feil person
-- får service role-nøkler.
create table if not exists public.admin_brukere (
  id uuid primary key references auth.users (id) on delete cascade,
  navn text not null,
  epost text not null,
  -- 'eier' kan alt. 'drift' kan se status og starte målinger, men ikke
  -- lese hemmeligheter eller opprette brukere i andre systemer.
  rolle text not null default 'eier' check (rolle in ('eier', 'drift')),
  aktiv boolean not null default true,
  -- Nye brukere får et midlertidig passord som den som opprettet dem
  -- kjenner. Derfor må det byttes før brukeren slipper inn.
  ma_bytte_passord boolean not null default false,
  opprettet timestamptz not null default now(),
  endret timestamptz not null default now()
);

create trigger admin_brukere_endret
  before update on public.admin_brukere
  for each row execute function public.sett_endret();

-- Brukes av hver enkelt policy under. `security definer` er nødvendig
-- for at funksjonen skal kunne lese admin_brukere uten selv å bli
-- stoppet av policyen som spør etter den – ellers blir det en evig
-- rekursjon som Postgres avviser.
create or replace function public.er_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.admin_brukere
    where id = auth.uid() and aktiv
  );
$$;

create or replace function public.er_eier()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.admin_brukere
    where id = auth.uid() and aktiv and rolle = 'eier'
  );
$$;

alter table public.admin_brukere enable row level security;

-- Alle admins ser hverandre: skal du kunne deaktivere en konto, må du
-- kunne se at den finnes.
create policy "admin ser admin_brukere"
  on public.admin_brukere for select
  using (public.er_admin());

create policy "eier endrer admin_brukere"
  on public.admin_brukere for update
  using (public.er_eier());


-- ═══════════════════════════════════════════════════════════
-- SYSTEMREGISTERET
-- ═══════════════════════════════════════════════════════════

-- Ett system = én app. Hver app har typisk ett Supabase-prosjekt, ett
-- Vercel-prosjekt og ett GitHub-repo, men ikke alltid: `tegningsmaler`
-- har ingen database, og `Perm-etikett` har verken database eller
-- Vercel. Derfor er alle koblingsfeltene valgfrie, og statusvisningen
-- hopper over det som mangler i stedet for å melde feil.
create table if not exists public.systemer (
  id uuid primary key default gen_random_uuid(),

  -- Kort navn brukt i URL-er: /systemer/rorlager. Stabilt; navnet kan
  -- endres uten at lenker råtner.
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  navn text not null,
  beskrivelse text,

  -- ── Supabase ──
  -- Prosjektreferansen er de 20 tegnene i URL-en, f.eks.
  -- erpcayowvmdcsbpdilak. Det er den Management-API-et vil ha.
  supabase_prosjekt_ref text,
  supabase_url text,

  -- ── Vercel ──
  vercel_prosjekt_id text,
  vercel_prosjekt_navn text,

  -- ── Kode og drift ──
  github_repo text, -- 'thomashauge03/rorlager'
  produksjons_url text,

  -- ── Visning og overvåking ──
  sortering integer not null default 100,
  aktiv boolean not null default true,
  -- Et system kan være aktivt men ikke overvåkes – f.eks. en mal som
  -- står stille. Da skal den ikke lyse rødt på forsiden hver dag.
  overvakes boolean not null default true,
  notat text,

  opprettet timestamptz not null default now(),
  endret timestamptz not null default now()
);

create index if not exists systemer_sortering_idx
  on public.systemer (sortering, navn);

create trigger systemer_endret
  before update on public.systemer
  for each row execute function public.sett_endret();

alter table public.systemer enable row level security;

create policy "admin ser systemer"
  on public.systemer for select using (public.er_admin());
create policy "eier skriver systemer"
  on public.systemer for insert with check (public.er_eier());
create policy "eier endrer systemer"
  on public.systemer for update using (public.er_eier());
create policy "eier sletter systemer"
  on public.systemer for delete using (public.er_eier());


-- ═══════════════════════════════════════════════════════════
-- HEMMELIGHETER
-- ═══════════════════════════════════════════════════════════

-- Andre systemers nøkler, kryptert med AES-256-GCM før innsetting.
-- Se src/lib/krypto.ts for hvorfor de ligger her og ikke i miljøet.
--
-- MERK: denne tabellen har radsikkerhet PÅ og ingen policy. Det er
-- ikke en forglemmelse – det betyr at verken anon- eller
-- authenticated-rollen kan lese en enkelt rad, uansett hvilken feil
-- som gjøres i appen. Bare service role kommer inn, og den brukes
-- utelukkende fra server-kode som først har kalt krevEier().
create table if not exists public.hemmeligheter (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references public.systemer (id) on delete cascade,

  -- 'service_role' og 'anon' er Supabase-nøklene. 'annet' dekker det
  -- som dukker opp senere – et Resend-token, en webhook-nøkkel.
  slag text not null check (slag in ('service_role', 'anon', 'annet')),
  -- Tomt for de faste slagene; fritt navn når slag = 'annet'. Tom
  -- streng framfor null, ellers ville unike-indeksen under sluppet
  -- gjennom duplikater (null = null er ukjent i SQL).
  navn text not null default '',

  verdi_kryptert text not null,
  -- Forkortet visning, f.eks. «eyJhbG…j9Qk». Lagres i klartekst med
  -- vilje: grensesnittet må kunne vise hvilken nøkkel som ligger der
  -- uten å dekryptere, og fire tegn er ikke nok til noe.
  hint text not null,

  opprettet timestamptz not null default now(),
  endret timestamptz not null default now(),

  unique (system_id, slag, navn)
);

create trigger hemmeligheter_endret
  before update on public.hemmeligheter
  for each row execute function public.sett_endret();

alter table public.hemmeligheter enable row level security;
-- Ingen policy. Se kommentaren over.


-- ═══════════════════════════════════════════════════════════
-- STATUSMÅLINGER
-- ═══════════════════════════════════════════════════════════

-- Historikk, ikke bare siste tilstand. Grunnen er at spørsmålet man
-- faktisk stiller er «hvor lenge har dette vært nede», og «sist sett
-- OK» kan ikke svares på fra en tabell som overskrives.
create table if not exists public.status_maalinger (
  id bigint generated always as identity primary key,
  system_id uuid not null references public.systemer (id) on delete cascade,

  -- Hva som ble målt. Et system kan være grønt på Vercel og rødt på
  -- databasen samtidig, og da er det viktig å se hvilken av dem.
  kilde text not null check (kilde in ('supabase', 'vercel', 'nettside')),
  tilstand text not null
    check (tilstand in ('ok', 'advarsel', 'nede', 'ukjent')),

  -- Kort forklaring til mennesket: «PAUSED», «byggefeil», «429 fra API».
  melding text,
  -- Rådata fra API-et, for å kunne svare på oppfølgingsspørsmål uten
  -- å måtte hente på nytt. jsonb framfor kolonner fordi formen skiller
  -- seg helt mellom Supabase og Vercel.
  detaljer jsonb not null default '{}'::jsonb,
  svartid_ms integer,

  malt_tid timestamptz not null default now()
);

-- Dekker både «siste måling per kilde» og «historikk for én kilde»,
-- som er de to eneste spørringene som finnes mot denne tabellen.
create index if not exists status_maalinger_oppslag_idx
  on public.status_maalinger (system_id, kilde, malt_tid desc);

alter table public.status_maalinger enable row level security;

create policy "admin ser status_maalinger"
  on public.status_maalinger for select using (public.er_admin());
-- Innsetting skjer fra cron-ruten med service role, ikke som en bruker.


-- ═══════════════════════════════════════════════════════════
-- IDENTITETSNAVET (grunnmur, tas i bruk gradvis)
-- ═══════════════════════════════════════════════════════════

-- Én rad per menneske, uansett hvor mange av systemene de bruker.
-- Tabellen opprettes nå selv om innloggingen fortsatt er per app,
-- fordi den er det som gjør «hvem har tilgang til hva» mulig å svare
-- på i det hele tatt. Se docs/INNLOGGINGSPORTAL.md for veien videre.
create table if not exists public.personer (
  id uuid primary key default gen_random_uuid(),
  navn text not null,
  epost text not null unique,
  telefon text,
  aktiv boolean not null default true,

  -- Settes når personen har fått konto i navet. Null betyr at de
  -- fortsatt bare finnes i de enkelte appene.
  nav_bruker_id uuid references auth.users (id) on delete set null,

  notat text,
  opprettet timestamptz not null default now(),
  endret timestamptz not null default now()
);

create trigger personer_endret
  before update on public.personer
  for each row execute function public.sett_endret();

alter table public.personer enable row level security;

create policy "admin ser personer"
  on public.personer for select using (public.er_admin());
create policy "eier skriver personer"
  on public.personer for insert with check (public.er_eier());
create policy "eier endrer personer"
  on public.personer for update using (public.er_eier());


-- Hvem har tilgang til hvilket system, med hvilken rolle der.
create table if not exists public.system_tilgang (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.personer (id) on delete cascade,
  system_id uuid not null references public.systemer (id) on delete cascade,

  -- Rollenavnet tilhører det systemet, ikke adminbordet: rørlageret har
  -- 'admin', utleien har 'admin' og 'service', grusappen har
  -- 'super_admin'. Fritekst framfor enum, ellers må adminbordet
  -- migreres hver gang en app finner opp en rolle.
  rolle text not null,

  -- Brukerens id i DET systemets auth.users. Dette er limet som gjør
  -- at adminbordet kan bytte passord på riktig bruker uten å slå opp
  -- på e-post hver gang – e-post kan endres, id-en er stabil.
  ekstern_bruker_id uuid,

  aktiv boolean not null default true,
  -- Sist gang adminbordet bekreftet at brukeren faktisk finnes i det
  -- systemet. Uten dette kan registeret stille bli feil når noen
  -- redigerer en app direkte i Supabase-konsollet.
  sist_bekreftet timestamptz,

  opprettet timestamptz not null default now(),
  endret timestamptz not null default now(),

  unique (person_id, system_id)
);

create index if not exists system_tilgang_system_idx
  on public.system_tilgang (system_id);

create trigger system_tilgang_endret
  before update on public.system_tilgang
  for each row execute function public.sett_endret();

alter table public.system_tilgang enable row level security;

create policy "admin ser system_tilgang"
  on public.system_tilgang for select using (public.er_admin());
create policy "eier skriver system_tilgang"
  on public.system_tilgang for insert with check (public.er_eier());
create policy "eier endrer system_tilgang"
  on public.system_tilgang for update using (public.er_eier());
create policy "eier sletter system_tilgang"
  on public.system_tilgang for delete using (public.er_eier());


-- ═══════════════════════════════════════════════════════════
-- HENDELSESLOGG
-- ═══════════════════════════════════════════════════════════

-- Adminbordet kan opprette og slette brukere i sju
-- produksjonsdatabaser. En logg over hvem som gjorde hva er derfor
-- ikke en finesse: uten den er «hvorfor kommer ikke Ola inn på
-- rørlageret lenger» et spørsmål ingen kan svare på.
create table if not exists public.hendelseslogg (
  id bigint generated always as identity primary key,

  utfort_av uuid references auth.users (id) on delete set null,
  -- E-posten lagres som tekst i tillegg til referansen, slik at loggen
  -- fortsatt er lesbar etter at en konto er slettet. En logg som mister
  -- avsenderen når brukeren fjernes er verdiløs nettopp i de tilfellene
  -- man trenger den.
  utfort_av_epost text,

  -- Punktnotasjon: 'system.opprettet', 'bruker.passord_satt',
  -- 'hemmelighet.lagret'. Gjør det mulig å filtrere på prefiks.
  handling text not null,
  system_id uuid references public.systemer (id) on delete set null,
  detaljer jsonb not null default '{}'::jsonb,

  tid timestamptz not null default now()
);

create index if not exists hendelseslogg_tid_idx
  on public.hendelseslogg (tid desc);
create index if not exists hendelseslogg_system_idx
  on public.hendelseslogg (system_id, tid desc);

alter table public.hendelseslogg enable row level security;

-- Leses av alle admins, men skrives kun med service role, og har
-- ingen update- eller delete-policy: en logg som kan redigeres av den
-- som logges er ikke en logg.
create policy "admin ser hendelseslogg"
  on public.hendelseslogg for select using (public.er_admin());

-- ═══════════════════════════════════════════════════════════
-- Tilgangsstyring: hvilke programmer en person har, og på hvilket nivå
--
-- Kravet er at man fra adminbordet velger hvilke programmer hver bruker
-- skal ha tilgang til, og hvilken rolle de skal ha INNAD i hvert program
-- – med de rollene som alt finnes der. Adminbordet skal ikke finne opp
-- et nytt rollebegrep på toppen; det ville bare blitt et sted til der
-- rollen kan være feil.
--
-- Det krever to ting `systemer` ikke hadde:
--   1. Hvilke roller finnes i hvert system  → system_roller
--   2. Hvor og hvordan rollen lagres der    → tilgangsoppsett
--
-- Punkt 2 er det som gjør at adminbordet kan skrive rollen inn i det
-- andre systemets egen tabell. Alternativet var fire hardkodede
-- adaptere i koden, én per app. Da må koden endres og rulles ut hver
-- gang en app døper om en kolonne, og den femte appen krever en femte
-- adapter. Med oppsettet i databasen er et nytt system en rad.
-- ═══════════════════════════════════════════════════════════


-- ── Rollene som finnes i hvert system ─────────────────────────
create table if not exists public.system_roller (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references public.systemer (id) on delete cascade,

  -- Verdien slik den lagres i systemets egen tabell: 'admin', 'service'.
  -- Ikke vår oppfinnelse – den må stemme med det appen sjekker på.
  verdi text not null,
  -- Det mennesket ser i nedtrekkslisten. 'service' sier ingenting til
  -- den som skal gi en ny ansatt tilgang; 'Servicearbeider' gjør det.
  etikett text not null,
  beskrivelse text,

  -- Rollen som foreslås når man gir noen tilgang til systemet.
  er_standard boolean not null default false,
  sortering integer not null default 100,

  opprettet timestamptz not null default now(),

  unique (system_id, verdi)
);

create index if not exists system_roller_system_idx
  on public.system_roller (system_id, sortering);

alter table public.system_roller enable row level security;

create policy "admin ser system_roller"
  on public.system_roller for select using (public.er_admin());
create policy "eier skriver system_roller"
  on public.system_roller for insert with check (public.er_eier());
create policy "eier endrer system_roller"
  on public.system_roller for update using (public.er_eier());
create policy "eier sletter system_roller"
  on public.system_roller for delete using (public.er_eier());


-- ── Hvor rollen lagres i systemets egen database ───────────────
--
-- MERK: kolonnene her holder IDENTIFIKATORER som ender opp i SQL som
-- kjøres mot en produksjonsdatabase. De valideres i to ledd: en
-- check-constraint her, og en regex i src/lib/tilgang.ts før noe sendes.
-- Uten det er dette et innsettingspunkt for SQL – og selv om bare en
-- eier kan skrive her, er «bare eieren kan ødelegge alt» ikke en
-- sikkerhetsmodell man skriver ned med vilje.
create table if not exists public.tilgangsoppsett (
  system_id uuid primary key references public.systemer (id) on delete cascade,

  skjema text not null default 'public'
    check (skjema ~ '^[a-z_][a-z0-9_]*$'),
  -- Tabellen som avgjør tilgang i appen: 'admin_brukere',
  -- 'super_admin_users', 'tenant_users'.
  tabell text not null
    check (tabell ~ '^[a-z_][a-z0-9_]*$'),

  -- Kolonnen som holder auth.users-id-en. Heter 'id' i noen apper,
  -- 'user_id' i andre.
  bruker_kolonne text not null default 'id'
    check (bruker_kolonne ~ '^[a-z_][a-z0-9_]*$'),

  -- Null når tabellen ikke har rolle i det hele tatt – da er det å ha
  -- en rad der hele tilgangen, og nivå finnes ikke i den appen.
  rolle_kolonne text
    check (rolle_kolonne is null or rolle_kolonne ~ '^[a-z_][a-z0-9_]*$'),

  -- Kolonnen som skrur tilgangen av uten å slette raden. Å deaktivere
  -- framfor å slette er riktig her: en slettet rad etterlater ordrer og
  -- signaturer som peker på en bruker ingen vet hvem var.
  aktiv_kolonne text
    check (aktiv_kolonne is null or aktiv_kolonne ~ '^[a-z_][a-z0-9_]*$'),

  /*
   * Kolonner appen krever i tillegg, som verdier eller plassholdere.
   * Eksempel: {"navn": "{{navn}}", "epost": "{{epost}}",
   *            "ma_bytte_passord": false}
   * Plassholderne {{navn}} og {{epost}} fylles fra personen.
   * Finnes fordi admin_brukere i utleien har navn og epost NOT NULL, og
   * en insert uten dem feiler.
   */
  ekstra_kolonner jsonb not null default '{}'::jsonb,

  -- ── Flerkunde ──
  -- Bare satt for tilbudssystemet. Der skiller tenant_id kundene, og en
  -- rad uten riktig tenant ville enten vært usynlig eller – verre – gitt
  -- tilgang til en annen kundes data.
  tenant_kolonne text
    check (tenant_kolonne is null or tenant_kolonne ~ '^[a-z_][a-z0-9_]*$'),
  tenant_verdi uuid,

  notat text,
  opprettet timestamptz not null default now(),
  endret timestamptz not null default now(),

  -- Har systemet en tenant-kolonne, må verdien være der også. Ellers
  -- ville en insert enten feilet på NOT NULL, eller landet i feil kunde.
  constraint tenant_krever_verdi
    check (tenant_kolonne is null or tenant_verdi is not null)
);

create trigger tilgangsoppsett_endret
  before update on public.tilgangsoppsett
  for each row execute function public.sett_endret();

-- Radsikkerhet på, ingen policy: dette oppsettet bestemmer hvilken
-- tabell adminbordet skriver til i en produksjonsdatabase. Det leses
-- bare av server-kode som først har kalt krevEier(), på samme måte som
-- `hemmeligheter`.
alter table public.tilgangsoppsett enable row level security;


-- ── system_tilgang får vite mer ───────────────────────────────

-- Om raden faktisk er skrevet inn i det andre systemet, eller bare
-- planlagt her. Uten dette kan registeret vise «har tilgang» for noe som
-- aldri ble skrevet fordi nøkkelen manglet, og da er registeret verre
-- enn ingenting.
alter table public.system_tilgang
  add column if not exists skrevet_til_system boolean not null default false;

alter table public.system_tilgang
  add column if not exists siste_feil text;


-- ── Rollene i de fire systemene som skal inn i portalen ───────
--
-- Verdiene er lest ut av migrasjonene og koden i hvert repo, ikke
-- gjettet. Kilder:
--   utleie          – admin_brukere.rolle check (admin|service),
--                     src/lib/auth.ts
--   rorlager        – supabase/migrations/20260810100100_rorlager_admins.sql
--   leveringseddel  – supabase/migrations/20260729200000_super_admin_users.sql
--   tilbudssystem   – tenant_users, current_tenant_id() i
--                     20260616000000_initial_multitenant_schema.sql

insert into public.system_roller (system_id, verdi, etikett, beskrivelse, er_standard, sortering)
select s.id, r.verdi, r.etikett, r.beskrivelse, r.er_standard, r.sortering
from public.systemer s
join (values
  ('utleie',         'admin',   'Administrator',    'Full tilgang: maskiner, kunder, leier, innstillinger.', true,  10),
  ('utleie',         'service', 'Servicearbeider',  'Bare verkstedet. Sendes dit ved innlogging, og slipper ikke inn i kundelister.', false, 20),
  ('rorlager',       'admin',   'Administrator',    'Full tilgang til lager, ordrer og faktura.', true, 10),
  ('leveringseddel', 'super_admin', 'Administrator', 'Full tilgang til lager, priser og leveringssedler.', true, 10)
) as r(system_slug, verdi, etikett, beskrivelse, er_standard, sortering)
  on r.system_slug = s.slug
on conflict (system_id, verdi) do nothing;

-- Tilbudssystemet har ingen rollekolonne: tilgangen ER å ha en rad i
-- tenant_users for kunden. Nivå innad finnes ikke der i dag, så det
-- ville vært misvisende å tilby et valg.
insert into public.system_roller (system_id, verdi, etikett, beskrivelse, er_standard, sortering)
select s.id, 'bruker', 'Bruker', 'Tilgang til Hauge Maskin sine tilbud. Tilbudssystemet har ingen nivåer innad.', true, 10
from public.systemer s where s.slug = 'tilbudssystem'
on conflict (system_id, verdi) do nothing;


-- ── Hvordan rollen skrives i hvert system ─────────────────────

insert into public.tilgangsoppsett
  (system_id, tabell, bruker_kolonne, rolle_kolonne, aktiv_kolonne, ekstra_kolonner, notat)
select s.id, o.tabell, o.bruker_kolonne, o.rolle_kolonne, o.aktiv_kolonne,
       o.ekstra::jsonb, o.notat
from public.systemer s
join (values
  ('utleie', 'admin_brukere', 'id', 'rolle', 'aktiv',
   '{"navn": "{{navn}}", "epost": "{{epost}}", "ma_bytte_passord": false}',
   'ma_bytte_passord settes false: brukeren har ikke fått noe midlertidig passord av oss – de kommer inn via portalen.'),

  ('rorlager', 'admin_brukere', 'id', 'rolle', 'aktiv',
   '{"navn": "{{navn}}", "epost": "{{epost}}"}',
   null),

  ('leveringseddel', 'super_admin_users', 'user_id', null, null,
   '{}',
   'Tabellen har ingen rollekolonne – å ha raden ER tilgangen. Sjekk kolonnenavnet mot migrasjonen før første skriving.')
) as o(system_slug, tabell, bruker_kolonne, rolle_kolonne, aktiv_kolonne, ekstra, notat)
  on o.system_slug = s.slug
on conflict (system_id) do nothing;

-- Tilbudssystemet, med tenant. tenant_verdi står som null her fordi
-- ID-en til Hauge Maskin-tenanten må leses ut av DEN databasen først –
-- den kan ikke gjettes. Adminbordet nekter å skrive tilgang til dette
-- systemet til verdien er satt, og sier hvorfor.
insert into public.tilgangsoppsett
  (system_id, tabell, bruker_kolonne, rolle_kolonne, aktiv_kolonne, tenant_kolonne, tenant_verdi, notat)
select s.id, 'tenant_users', 'user_id', null, null, 'tenant_id', null,
  'FLERKUNDE. tenant_verdi må settes til id-en for Hauge Maskin i tenants-tabellen før noen tilgang kan skrives. Kjør: select id, name from tenants; i tilbudssystemets database.'
from public.systemer s where s.slug = 'tilbudssystem'
on conflict (system_id) do nothing;

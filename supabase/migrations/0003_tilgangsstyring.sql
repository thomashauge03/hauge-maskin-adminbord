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

  -- Kolonnen som identifiserer brukeren. Heter 'id' i utleien,
  -- 'user_id' i tilbudssystemet, 'email' i de to lager-appene.
  bruker_kolonne text not null default 'id'
    check (bruker_kolonne ~ '^[a-z_][a-z0-9_]*$'),

  /*
   * HVA som skal stå i den kolonnen.
   *
   * Dette er den viktigste forskjellen mellom appene, og den som er
   * lettest å ta feil av. Utleien og tilbudssystemet peker på
   * auth.users-id-en. Rørlageret og leveringsseddelen bruker
   * E-POSTEN som nøkkel – de har ingen referanse til auth.users i det
   * hele tatt, og sjekker tilgang mot auth.email().
   *
   * Konsekvensen er større enn den ser ut: for de to e-postnøklede
   * appene kan adminbordet gi tilgang FØR brukeren har logget inn en
   * eneste gang, og en ny innlogging gjennom portalen treffer riktig rad
   * automatisk. For de to id-nøklede må auth-brukeren finnes først.
   */
  bruker_nokkel text not null default 'auth_id'
    check (bruker_nokkel in ('auth_id', 'epost')),

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


-- ═══════════════════════════════════════════════════════════
-- De fire systemene som skal inn i den felles innloggingen
--
-- ALT under er lest ut av koden og de levende databasene, ikke gjettet.
-- De fire appene ligner mindre på hverandre enn man skulle tro:
--
--   system          tabell           nøkkel        rollekolonne  roller
--   ──────────────  ───────────────  ────────────  ────────────  ─────────────────────
--   utleie          admin_brukere    id (auth)     rolle         admin, service
--   rorlager        system_users     email         role          admin, kontor, lager
--   leveringseddel  system_users     email         role          admin, kontor, sjafor
--   tilbudssystem   tenant_users     user_id+tenant role         admin, member
--
-- Kilder:
--   utleie          src/lib/auth.ts, src/app/admin/(panel)/brukere/actions.ts
--   rorlager        src/pages/AdminUsers.tsx (ROLES), migrasjon
--                   20260810100100_rorlager_admins.sql
--   leveringseddel  src/pages/AdminUsers.tsx (SelectItem-verdiene), migrasjon
--                   20260729200000_super_admin_users.sql
--   tilbudssystem   tenant_users i den levende basen, og
--                   20260616000000_initial_multitenant_schema.sql
-- ═══════════════════════════════════════════════════════════

insert into public.system_roller (system_id, verdi, etikett, beskrivelse, er_standard, sortering)
select s.id, r.verdi, r.etikett, r.beskrivelse, r.er_standard, r.sortering
from public.systemer s
join (values
  -- Utleien. Rollene står i en check-constraint på admin_brukere.rolle,
  -- og service sendes til verkstedet ved innlogging.
  ('utleie', 'admin',   'Administrator',   'Full tilgang: maskiner, kunder, leier, innstillinger.', true,  10),
  ('utleie', 'service', 'Servicearbeider', 'Bare verkstedet. Sendes dit ved innlogging, og slipper ikke inn i kundelister.', false, 20),

  -- Rørlageret.
  ('rorlager', 'admin',  'Admin',  'Full tilgang til lager, ordrer, priser og faktura.', true,  10),
  ('rorlager', 'kontor', 'Kontor', 'Kontorfunksjoner.', false, 20),
  ('rorlager', 'lager',  'Lager',  'Lagerfunksjoner.',  false, 30),

  -- Leveringsseddelen. Merk sjafor uten å – slik står den i koden, og
  -- verdien må stemme på tegnet.
  ('leveringseddel', 'admin',  'Admin',  'Full tilgang til leveringer, varelager, priser og faktura.', true,  10),
  ('leveringseddel', 'kontor', 'Kontor', 'Kontorfunksjoner.', false, 20),
  ('leveringseddel', 'sjafor', 'Sjåfør', 'Sjåførfunksjoner.', false, 30),

  -- Tilbudssystemet. Kolonnen heter `role` – den appen er skrevet på
  -- engelsk. member er standard fordi det er det de fleste eksisterende
  -- radene har.
  ('tilbudssystem', 'admin',  'Administrator', 'Full tilgang til Hauge Maskin sine tilbud og innstillinger.', false, 10),
  ('tilbudssystem', 'member', 'Bruker',        'Vanlig tilgang til Hauge Maskin sine tilbud.',                true,  20)
) as r(system_slug, verdi, etikett, beskrivelse, er_standard, sortering)
  on r.system_slug = s.slug
on conflict (system_id, verdi) do nothing;


-- ── Hvordan tilgangen skrives i hvert system ──────────────────

/*
 * De to e-postnøklede appene først.
 *
 * Rørlageret og leveringsseddelen har ingen referanse til auth.users:
 * `system_users` er nøklet på email, og appene sjekker tilgang mot
 * auth.email(). Det gjør dem enklere enn de andre to – adminbordet kan
 * gi tilgang før brukeren noen gang har logget inn, og en innlogging
 * gjennom portalen treffer riktig rad av seg selv.
 *
 * Navnekolonnen heter full_name, ikke navn.
 */
insert into public.tilgangsoppsett
  (system_id, tabell, bruker_kolonne, bruker_nokkel, rolle_kolonne,
   aktiv_kolonne, ekstra_kolonner, notat)
select s.id, 'system_users', 'email', 'epost', 'role',
       null, '{"full_name": "{{navn}}"}'::jsonb, o.notat
from public.systemer s
join (values
  ('rorlager',
   'Nøklet på e-post. Ingen aktiv-kolonne: tilgang fjernes ved å slette raden. Det finnes også en super_admins-tabell, nøklet på e-post, for den som skal kunne styre brukere i appen selv.'),
  ('leveringseddel',
   'Nøklet på e-post. Samme tabellform som rørlageret – de to appene er i slekt. Ingen aktiv-kolonne.')
) as o(system_slug, notat) on o.system_slug = s.slug
on conflict (system_id) do nothing;

/*
 * Utleien. Den eneste som følger mønsteret jeg først antok for alle:
 * admin_brukere nøklet på auth.users-id.
 *
 * navn og epost er NOT NULL der, så en insert uten dem feiler.
 * ma_bytte_passord settes false fordi brukeren ikke har fått noe
 * midlertidig passord av oss – de kommer inn gjennom portalen.
 */
insert into public.tilgangsoppsett
  (system_id, tabell, bruker_kolonne, bruker_nokkel, rolle_kolonne,
   aktiv_kolonne, ekstra_kolonner, notat)
select s.id, 'admin_brukere', 'id', 'auth_id', 'rolle', 'aktiv',
  '{"navn": "{{navn}}", "epost": "{{epost}}", "ma_bytte_passord": false}'::jsonb,
  'Nøklet på auth.users-id, så auth-brukeren må finnes i utleiens eget prosjekt før tilgang kan skrives. Har aktiv-kolonne, så tilgang kan skrus av uten å slette raden – det er å foretrekke, fordi leier og signaturer peker på brukeren.'
from public.systemer s where s.slug = 'utleie'
on conflict (system_id) do nothing;

/*
 * Tilbudssystemet, med tenant.
 *
 * tenant_verdi er ID-en til Hauge Maskin i tenants-tabellen, lest ut av
 * den levende databasen. Den er hardkodet her med vilje: dette er den
 * ENE verdien som hindrer at en tilgang gitt herfra havner hos en annen
 * kunde. Basen har tre reelle kunder – Techauge, TT Anlegg og Hauge
 * Maskin – og RLS skiller dem utelukkende på current_tenant_id(), som
 * leser tenant_users. Skriver vi feil tenant her, får en Hauge
 * Maskin-ansatt lese en annen bedrifts tilbud, og ingenting i appen
 * ville stoppet det.
 */
insert into public.tilgangsoppsett
  (system_id, tabell, bruker_kolonne, bruker_nokkel, rolle_kolonne,
   aktiv_kolonne, tenant_kolonne, tenant_verdi, notat)
select s.id, 'tenant_users', 'user_id', 'auth_id', 'role',
  null, 'tenant_id', '95ee2a3d-6bd3-4a94-ab44-c000c49beae5'::uuid,
  'FLERKUNDE med tre kunder i samme base. tenant_verdi er Hauge Maskin (slug hauge-maskin). Endres den, gis tilgang til feil bedrifts data. Nøklet på auth-id, så auth-brukeren må finnes i tilbudssystemets prosjekt først.'
from public.systemer s where s.slug = 'tilbudssystem'
on conflict (system_id) do nothing;

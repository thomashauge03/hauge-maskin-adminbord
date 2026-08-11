-- ═══════════════════════════════════════════════════════════
-- Tilgang kommer fra FLERE veier per system, og for to systemer finnes
-- ingen rolletabell i det hele tatt.
--
-- 0003 antok én tabell per system, og at den tabellen var sannheten. Målt mot
-- de levende basene 2026-08-12 er begge antakelsene feil:
--
--   * leveringseddel og rorlager har INGEN rolletabell som avgjør noe. Hver
--     policy på hver datatabell er `to authenticated using (true)`. Bekreftet
--     i pg_policies, ikke sluttet fra migrasjonsfilene – som appene selv
--     advarer om ikke stemmer med prod. `system_users` er et passivt register:
--     policyene på den er `is_super_admin()`, og ingen policy, funksjon eller
--     trigger andre steder leser den. Å skrive en rad der ga ingen tilgang,
--     og å slette en fjernet ingen.
--
--   * tilbudssystemet har to veier gjennom SAMME tabell. `is_system_admin()`
--     spør tenant_users UTEN tenant-filter, så `role='admin'` hos én kunde gir
--     makt over alle. Med tenant-filter viste matrisen en plattform-admin som
--     «uten tilgang».
--
--   * leveringseddel og rorlager har i tillegg `super_admins`, nøklet på
--     e-post, som styrer brukeradministrasjonen i appene.
--
-- Derfor: flere rader per system, og en `modell` som kan si «alle med konto
-- har full tilgang» – det svaret var kjent hele tiden, og verre enn både å
-- peke på feil tabell og å si «vet ikke».
-- ═══════════════════════════════════════════════════════════


-- ── Skjemaet: fra én vei til mange ──

alter table public.tilgangsoppsett
  add column if not exists id uuid not null default gen_random_uuid();

alter table public.tilgangsoppsett
  drop constraint if exists tilgangsoppsett_pkey;

alter table public.tilgangsoppsett
  add primary key (id);

-- Navnet på veien. Vises i matrisen, fordi «admin» betyr forskjellige ting
-- avhengig av hvilken vei den kom fra – og i tilbudssystemet er forskjellen
-- mellom «admin hos oss» og «admin over alle kunder».
alter table public.tilgangsoppsett
  add column if not exists etikett text not null default 'Tilgang';

/*
 * Hvordan systemet avgjør tilgang.
 *
 * 'rolletabell' – en tabell holder tilgangen. Da må `tabell` være satt.
 * 'kun_konto'   – enhver rad i auth.users gir full tilgang. Ingen tabell.
 *
 * Den andre verdien er ikke en nødløsning; den er det sanne svaret for to av
 * systemene, og den eneste måten matrisen kan si det høyt.
 */
alter table public.tilgangsoppsett
  add column if not exists modell text not null default 'rolletabell';

alter table public.tilgangsoppsett
  drop constraint if exists tilgangsoppsett_modell_sjekk;
alter table public.tilgangsoppsett
  add constraint tilgangsoppsett_modell_sjekk
  check (modell in ('rolletabell', 'kun_konto'));

-- 'kun_konto' har ingen tabell å peke på.
alter table public.tilgangsoppsett
  alter column tabell drop not null;

alter table public.tilgangsoppsett
  drop constraint if exists tilgangsoppsett_tabell_kreves;
alter table public.tilgangsoppsett
  add constraint tilgangsoppsett_tabell_kreves
  check (modell <> 'rolletabell' or tabell is not null);

/*
 * Får adminbordet SKRIVE i denne veien?
 *
 * Default false, altså fail-closed. En vei vi kan lese er ikke automatisk en
 * vei vi skal skrive i: `super_admins` gir tilgang til hele
 * brukeradministrasjonen, og plattform-admin i tilbudssystemet gir makt over
 * andre bedrifters data. Å skrive der skal være en beslutning noen har tatt,
 * ikke noe som følger av at kolonnene passet.
 */
alter table public.tilgangsoppsett
  add column if not exists kan_skrive boolean not null default false;

alter table public.tilgangsoppsett
  add column if not exists sortering integer not null default 100;

create unique index if not exists tilgangsoppsett_system_etikett_idx
  on public.tilgangsoppsett (system_id, etikett);
create index if not exists tilgangsoppsett_system_idx
  on public.tilgangsoppsett (system_id, sortering);


-- ── De tre veiene som ALT var riktige beholder skriverett ──

update public.tilgangsoppsett t
   set kan_skrive = true,
       etikett = case s.slug
         when 'tilbudssystem' then 'Medlem av Hauge Maskin'
         when 'utleie' then 'Admin-bruker'
         else 'Adminbordbruker'
       end,
       sortering = 10
  from public.systemer s
 where s.id = t.system_id
   and s.slug in ('tilbudssystem', 'utleie', 'adminbord');


-- ── leveringseddel og rorlager: raden pekte på en tabell uten virkning ──

update public.tilgangsoppsett t
   set modell = 'kun_konto',
       tabell = null,
       bruker_kolonne = 'id',
       bruker_nokkel = 'auth_id',
       rolle_kolonne = null,
       aktiv_kolonne = null,
       ekstra_kolonner = '{}'::jsonb,
       etikett = 'Full tilgang (alle med konto)',
       kan_skrive = false,
       sortering = 10,
       notat = 'ALLE MED KONTO HAR FULL TILGANG. Hver policy på hver'
         || ' datatabell er `to authenticated using (true)` – bekreftet i'
         || ' pg_policies 2026-08-12, ikke lest fra migrasjonsfilene. Det'
         || ' finnes ingen rolletabell som avgjør noe.'
         || E'\n\nsystem_users er et PASSIVT register: policyene på den er'
         || ' is_super_admin(), og ingen policy, funksjon eller trigger leser'
         || ' den når tilgang avgjøres. 0003 pekte hit, så «gi tilgang» skrev'
         || ' en rad uten virkning og «ta bort» fjernet ingen tilgang.'
         || E'\n\nSelvregistrering er PÅ i prosjektet (disable_signup=false).'
         || ' Den som kan ta imot e-post kan registrere seg og få alt. Reell'
         || ' styring skjer ved å opprette eller sperre kontoen i auth.users.'
  from public.systemer s
 where s.id = t.system_id
   and s.slug in ('leveringseddel', 'rorlager');


-- ── super_admins: den andre veien i de to lager-appene ──
--
-- Styrer brukeradministrasjonen i appene (is_super_admin(), nøklet på
-- lower(e-post)). Leses, men skrives ikke: å gi noen super admin er å gi bort
-- kontrollen over hvem andre som slipper inn.

insert into public.tilgangsoppsett (
  system_id, skjema, tabell, bruker_kolonne, bruker_nokkel,
  rolle_kolonne, aktiv_kolonne, modell, etikett, kan_skrive, sortering, notat
)
select s.id, 'public', 'super_admins', 'email', 'epost',
       null, null, 'rolletabell', 'Super admin', false, 20,
       'Styrer /admin/brukere i appen, gjennom is_super_admin() som'
         || ' sammenligner lower(auth.jwt()->>''email''). Ingen rolle- eller'
         || ' aktivkolonne – å ha raden ER tilgangen. Leses av adminbordet,'
         || ' men skrives ikke: dette er retten til å bestemme hvem andre som'
         || ' slipper inn.'
  from public.systemer s
 where s.slug in ('leveringseddel', 'rorlager')
on conflict (system_id, etikett) do nothing;


-- ── Plattform-admin i tilbudssystemet: samme tabell, uten tenant-filter ──
--
-- is_system_admin() spør tenant_users uten tenant_id-vilkår. En admin hos
-- Techauge har derfor full makt over Hauge Maskin-dataene, inkludert
-- admin_delete_tenant. Uten denne raden filtrerer matrisen den personen bort
-- og viser «uten tilgang» – som er det motsatte av sant.

insert into public.tilgangsoppsett (
  system_id, skjema, tabell, bruker_kolonne, bruker_nokkel,
  rolle_kolonne, aktiv_kolonne, modell, etikett, kan_skrive, sortering, notat
)
select s.id, 'public', 'tenant_users', 'user_id', 'auth_id',
       'role', null, 'rolletabell', 'Plattform-admin (alle kunder)', false, 20,
       'is_system_admin() spør tenant_users UTEN tenant-filter, så role=''admin'''
         || ' hos EN kunde gir makt over alle kundene. Denne veien leses uten'
         || ' tenant-vilkår nettopp derfor. Skrives ikke: å gi plattform-admin'
         || ' er å gi tilgang til andre bedrifters data.'
  from public.systemer s
 where s.slug = 'tilbudssystem'
on conflict (system_id, etikett) do nothing;


-- ── Rollen «admin» i tilbudssystemet er ikke det etiketten sa ──

update public.system_roller r
   set etikett = 'Administrator (ALLE kunder)',
       beskrivelse = 'ADVARSEL: is_system_admin() har ikke tenant-filter, så'
         || ' denne rollen gir makt over Techauge og TT Anlegg i tillegg til'
         || ' Hauge Maskin – inkludert å slette en hel kunde. Bruk «Bruker»'
         || ' med mindre plattform-tilgang er meningen.'
  from public.systemer s
 where s.id = r.system_id
   and s.slug = 'tilbudssystem'
   and r.verdi = 'admin';


-- ── Rollene i de to lager-appene finnes ikke i virkeligheten ──
--
-- 'kontor', 'sjafor' og 'lager' sammenlignes ingen steder i appene. De sto i
-- system_users, som ikke avgjør noe. Å ha dem i nedtrekkslisten ville lovet et
-- nivå som ikke finnes.

delete from public.system_roller r
 using public.systemer s
 where s.id = r.system_id
   and s.slug in ('leveringseddel', 'rorlager');


-- ── Notatet på rorlager påsto en tabell som ikke finnes ──

update public.systemer
   set notat = 'Vite + React.'
         || E'\n\nRETTELSE: notatet sa «Rollen ligger i admin_brukere». Den'
         || ' tabellen finnes ikke i rørlageret i det hele tatt – 0 treff i'
         || ' kilde, migrasjoner og det utrullede bygget. Tilgang = rad i'
         || ' auth.users; se tilgangsoppsettet.'
 where slug = 'rorlager';

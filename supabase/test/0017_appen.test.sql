-- Tilgangsregelen i appen, mot en ekte Postgres. `npm run test:sql`.
--
-- Samme tilfeller som src/lib/sideregel.test.mjs. Står regelen ett sted og
-- ikke det andre, viser adminbordet noe annet enn appen gjør.
--
-- Adminer følger gruppene som alle andre (0018). Ingen ser alt, og ingen
-- admin slipper inn uten å ha registrert seg (0019).

-- ── Folk ───────────────────────────────────────────────────────
-- Uten 'navn' i metadataene hopper triggeren ny_appbrukar over dem, så
-- personradene legges inn for hånd under.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ola@hm.no'),
  ('00000000-0000-0000-0000-00000000000b', 'kari@hm.no'),
  ('00000000-0000-0000-0000-00000000000c', 'per@hm.no'),
  ('00000000-0000-0000-0000-00000000000d', 'vent@hm.no'),
  ('00000000-0000-0000-0000-00000000000e', 'sperra@hm.no'),
  ('00000000-0000-0000-0000-00000000000f', 'begge@hm.no'),
  ('00000000-0000-0000-0000-0000000000a1', 'admin@hm.no'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin2@hm.no'),
  ('00000000-0000-0000-0000-0000000000a3', 'gammel@hm.no'),
  ('00000000-0000-0000-0000-0000000000a4', 'slattav@hm.no'),
  ('00000000-0000-0000-0000-000000000010', 'dobbel@hm.no');

insert into public.personer (id, navn, epost, nav_bruker_id, status) values
  ('10000000-0000-0000-0000-00000000000a', 'Ola',    'ola@hm.no',    '00000000-0000-0000-0000-00000000000a', 'godkjent'),
  ('10000000-0000-0000-0000-00000000000b', 'Kari',   'kari@hm.no',   '00000000-0000-0000-0000-00000000000b', 'godkjent'),
  ('10000000-0000-0000-0000-00000000000c', 'Per',    'per@hm.no',    '00000000-0000-0000-0000-00000000000c', 'godkjent'),
  ('10000000-0000-0000-0000-00000000000d', 'Vent',   'vent@hm.no',   '00000000-0000-0000-0000-00000000000d', 'venter'),
  ('10000000-0000-0000-0000-00000000000e', 'Sperra', 'sperra@hm.no', '00000000-0000-0000-0000-00000000000e', 'sperra'),
  ('10000000-0000-0000-0000-00000000000f', 'Begge',  'begge@hm.no',  '00000000-0000-0000-0000-00000000000f', 'godkjent'),
  ('10000000-0000-0000-0000-0000000000a2', 'Admin2', 'admin2@hm.no', '00000000-0000-0000-0000-0000000000a2', 'godkjent'),
  ('10000000-0000-0000-0000-0000000000a4', 'Slått av', 'slattav@hm.no', '00000000-0000-0000-0000-0000000000a4', 'godkjent'),
  ('10000000-0000-0000-0000-000000000010', 'Dobbel', 'dobbel@hm.no', '00000000-0000-0000-0000-000000000010', 'godkjent');

insert into public.admin_brukere (id, navn, epost, rolle, aktiv) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin',    'admin@hm.no',   'eier',  true),
  ('00000000-0000-0000-0000-0000000000a2', 'Admin2',   'admin2@hm.no',  'drift', true),
  ('00000000-0000-0000-0000-0000000000a3', 'Gammel',   'gammel@hm.no',  'drift', false),
  -- Slått av som admin, men registrert i appen som alle andre
  ('00000000-0000-0000-0000-0000000000a4', 'Slått av', 'slattav@hm.no', 'drift', false);

insert into public.grupper (id, navn) values
  ('20000000-0000-0000-0000-000000000001', 'Sjåfør'),
  ('20000000-0000-0000-0000-000000000002', 'Kontor');

insert into public.gruppe_sider (gruppe_id, side_id) values
  ('20000000-0000-0000-0000-000000000001', 'leveringseddel'),
  ('20000000-0000-0000-0000-000000000001', 'utleie'),
  ('20000000-0000-0000-0000-000000000002', 'tripletex'),
  ('20000000-0000-0000-0000-000000000002', 'utleie');

insert into public.person_gruppe (person_id, gruppe_id) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-00000000000d', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-00000000000e', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-00000000000f', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-00000000000f', '20000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-0000000000a4', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000001');

insert into public.side_tilgang (person_id, side_id, gi) values
  -- Per: tatt bort, selv om begge gruppene hans gir den
  ('10000000-0000-0000-0000-00000000000c', 'utleie', false),
  -- Per: gitt uten gruppe
  ('10000000-0000-0000-0000-00000000000c', 'smartdok', true),
  -- Kari: tatt bort det hun aldri hadde
  ('10000000-0000-0000-0000-00000000000b', 'tripletex', false),
  -- Dobbel: gitt særskilt det Sjåfør også gir
  ('10000000-0000-0000-0000-000000000010', 'utleie', true);

-- Den gamle standardregelen skal ikke gi noen noe lenger.
insert into public.side_standard (side_id, standard) values ('tilbudssystem', false);


-- ── Hjelpere ───────────────────────────────────────────────────
create schema test;
grant usage on schema test to anon, authenticated;

create function test.forvent(hvem text, bruker text, ventet text[]) returns void
language plpgsql as $$
declare
  fikk text[];
begin
  perform set_config('request.jwt.claim.sub', bruker, true);
  select coalesce(array_agg(side_id order by side_id), '{}') into fikk from public.mine_sider;
  if fikk is distinct from ventet then
    raise exception '% skulle sett %, men så %', hvem, ventet, fikk;
  end if;
end $$;

create function test.forvent_status(hvem text, bruker text, ventet text) returns void
language plpgsql as $$
declare
  fikk text;
begin
  perform set_config('request.jwt.claim.sub', bruker, true);
  select coalesce(string_agg(status || ':' || alle_sider::text, ',' order by status), '')
    into fikk from public.min_status;
  if fikk is distinct from ventet then
    raise exception '% skulle hatt status «%», men fikk «%»', hvem, ventet, fikk;
  end if;
end $$;


-- ── Regelen, som den innloggede ────────────────────────────────
set role authenticated;

select test.forvent('Ola (Sjåfør)', '00000000-0000-0000-0000-00000000000a', array['leveringseddel', 'utleie']);
select test.forvent('Kari (ingen grupper)', '00000000-0000-0000-0000-00000000000b', '{}');
select test.forvent('Per (unntak begge veier)', '00000000-0000-0000-0000-00000000000c', array['leveringseddel', 'smartdok', 'tripletex']);
select test.forvent('Vent (venter, i gruppe)', '00000000-0000-0000-0000-00000000000d', '{}');
select test.forvent('Sperra (stengt ute, i gruppe)', '00000000-0000-0000-0000-00000000000e', '{}');
select test.forvent('Begge (samme side fra to grupper)', '00000000-0000-0000-0000-00000000000f', array['leveringseddel', 'tripletex', 'utleie']);
select test.forvent('Dobbel (samme side fra unntak og gruppe)', '00000000-0000-0000-0000-000000000010', array['leveringseddel', 'utleie']);
-- Om man er admin eller ikke, betyr ingenting for appen – personraden avgjør
select test.forvent('Admin som er slått av, med personrad (Sjåfør)', '00000000-0000-0000-0000-0000000000a4', array['leveringseddel', 'utleie']);
select test.forvent('Admin uten personrad', '00000000-0000-0000-0000-0000000000a1', '{}');
select test.forvent('Admin med personrad (Kontor)', '00000000-0000-0000-0000-0000000000a2', array['tripletex', 'utleie']);
select test.forvent('Ingen innlogget', '', '{}');

select test.forvent_status('Ola', '00000000-0000-0000-0000-00000000000a', 'godkjent:false');
select test.forvent_status('Vent', '00000000-0000-0000-0000-00000000000d', 'venter:false');
-- Ingen rad: appen viser «Noe gikk galt» og slipper ikke kontoen inn
select test.forvent_status('Admin uten personrad', '00000000-0000-0000-0000-0000000000a1', '');
select test.forvent_status('Admin med personrad', '00000000-0000-0000-0000-0000000000a2', 'godkjent:false');
select test.forvent_status('Admin som er slått av', '00000000-0000-0000-0000-0000000000a3', '');
select test.forvent_status('Admin som er slått av, med personrad', '00000000-0000-0000-0000-0000000000a4', 'godkjent:false');

reset role;


-- ── anon får ingenting ─────────────────────────────────────────
set role anon;

do $$
begin
  begin
    perform 1 from public.mine_sider;
    raise exception 'anon fikk lese mine_sider';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.min_status;
    raise exception 'anon fikk lese min_status';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;


-- ── Indeksene ──────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.personer_nav_bruker_idx') is null then
    raise exception 'mangler personer_nav_bruker_idx';
  end if;
  if to_regclass('public.hendelseslogg_person_idx') is null then
    raise exception 'mangler hendelseslogg_person_idx';
  end if;
end $$;

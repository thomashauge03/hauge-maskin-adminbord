-- ═══════════════════════════════════════════════════════════
-- Tabellen livstegnet skal treffe, når den ikke kan oppdages.
--
-- Livstegnet finner normalt en tabell selv, med en spørring mot pg_tables.
-- Det virker for sju av åtte prosjekt.
--
-- qr-admin (thypecauthhleewecgfu) kan ikke spørres med SQL i det hele tatt:
--
--   FATAL: 28P01: password authentication failed for user
--          "supabase_read_only_user"
--
-- Lesebrukeren som Management-API-ets lesespørring bruker har mistet passordet
-- sitt der. Det er også grunnen til at prosjektet står uten aktivitetstall på
-- oversikten, og uten nøkkeltall på systemsiden – ikke fordi det er stille,
-- men fordi vi ikke får spurt.
--
-- REST-veien bruker IKKE den brukeren. Med et tabellnavn oppgitt kan
-- livstegnet derfor gå fint likevel, og prosjektet holdes i live mens den
-- egentlige feilen står uløst.
--
-- Den egentlige feilen krever at databasepassordet tilbakestilles i
-- Supabase-konsollet, som regenererer lesebrukerens legitimasjon. Det kan
-- ikke gjøres herfra.
-- ═══════════════════════════════════════════════════════════

alter table public.systemer
  add column if not exists livstegn_tabell text;

comment on column public.systemer.livstegn_tabell is
  'Tabell i public som livstegnet skal treffe. Null = finn den selv. Settes bare når oppdagelsen ikke virker.';

alter table public.systemer
  drop constraint if exists systemer_livstegn_tabell_navn;
alter table public.systemer
  add constraint systemer_livstegn_tabell_navn
  check (livstegn_tabell is null or livstegn_tabell ~ '^[a-z_][a-z0-9_]*$');

-- profiles er bekreftet å finnes i qr-admin: den ble lest med Management-APIet
-- 2026-08-12, før lesebrukeren sluttet å virke, og hadde to rader.
update public.systemer
   set livstegn_tabell = 'profiles',
       notat = coalesce(notat || E'\n\n', '')
         || 'LESEBRUKEREN VIRKER IKKE: Management-APIets lesespørring svarer'
         || ' «FATAL: 28P01: password authentication failed for user'
         || ' supabase_read_only_user». Derfor mangler prosjektet'
         || ' aktivitetstall og nøkkeltall – ikke fordi det er stille, men'
         || ' fordi vi ikke får spurt. Rettes ved å tilbakestille'
         || ' databasepassordet i Supabase-konsollet, som regenererer'
         || ' lesebrukeren.'
         || E'\n\nLivstegnet går likevel: REST-veien bruker ikke den brukeren,'
         || ' og livstegn_tabell er satt til profiles.'
 where slug = 'qr-admin'
   and livstegn_tabell is null;

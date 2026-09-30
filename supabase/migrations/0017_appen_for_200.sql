-- ═══════════════════════════════════════════════════════════
-- Appen for 200 brukere
--
-- Ingen ser noe før de er i en gruppe – ansatte og kunder likt. Appen
-- samler lenker, og eier legger folk i grupper selv. Standardsidene
-- forsvinner.
--
-- `mine_sideval` fra 0016 står URØRT. Appversjon 1.7–1.14 leser den, og
-- den kan ikke uttrykke «skjul alt som ikke er gitt»: sidelista bor i
-- sider.json på GitHub, ikke her. `minimum` 1.17.0 i versjon.json tvinger
-- alt fra 1.15 over på `mine_sider`. Den og `side_standard` fjernes når
-- ingen er på eldre enn 1.17.
--
-- Kjøres i SQL-editoren i navet. Kan kjøres flere ganger.
-- ═══════════════════════════════════════════════════════════


-- ── Sidene jeg ser ────────────────────────────────────────────
--
-- Svarer med sidene jeg SER, ikke med avvik. Fraværet av en rad betyr nei
-- – motsatt av mine_sideval, og det er hele poenget: en ny side ingen har
-- gitt deg, er ikke din.
--
-- MÅ være samme regel som src/lib/sideregel.ts:
--   1. Eget unntak for siden?   → det avgjør.
--   2. Gir en av gruppene den?  → ja.
--   3. Ellers                   → nei.
--
-- `union` og ikke `union all`: samme side kan komme fra flere grupper,
-- eller fra både et unntak og en gruppe.
--
-- `security_invoker = false` skal stå: viewet leser tabeller telefonen ikke
-- får lese selv, og med invoker fikk hver telefon en tom liste. Supabases
-- Security Advisor flagger slike viewer, og det er ment.
create or replace view public.mine_sider
with (security_invoker = false) as
  with meg as (
    select p.id
      from public.personer p
     where p.nav_bruker_id = auth.uid()
       and p.status = 'godkjent'
  )
  select st.side_id
    from public.side_tilgang st
    join meg on meg.id = st.person_id
   where st.gi

  union

  select gs.side_id
    from public.gruppe_sider gs
    join public.person_gruppe pg on pg.gruppe_id = gs.gruppe_id
    join meg on meg.id = pg.person_id
   where not exists (
     select 1
       from public.side_tilgang st2
      where st2.person_id = meg.id
        and st2.side_id = gs.side_id
        and not st2.gi
   );

-- Supabase gir anon select på alt nytt i public. Det holder ikke å GI
-- tilgang – den må tas fra anon.
revoke all on public.mine_sider from anon;
grant select on public.mine_sider to authenticated;


-- ── Adminer ser alt ───────────────────────────────────────────
--
-- En admin uten personrad kan ikke legges i en gruppe, og ville fått tom
-- app. Den som styrer systemene skal kunne åpne dem – samme begrunnelse som
-- 0014. Gjelder også en admin som har registrert seg som person.
--
-- Kolonnen står SIST. Da godtar `create or replace view` den, og gamle
-- apper som ber om status,navn,epost merker ingenting.
create or replace view public.min_status
with (security_invoker = false) as
  select p.status,
         p.navn,
         p.epost,
         exists (
           select 1
             from public.admin_brukere a
            where a.id = auth.uid()
              and a.aktiv
         ) as alle_sider
    from public.personer p
   where p.nav_bruker_id = auth.uid()

  union all

  select 'godkjent'::text,
         a.navn,
         a.epost,
         true
    from public.admin_brukere a
   where a.id = auth.uid()
     and a.aktiv
     and not exists (
       select 1
         from public.personer p2
        where p2.nav_bruker_id = auth.uid()
     );

revoke all on public.min_status from anon;
grant select on public.min_status to authenticated;


-- ── Indekser ──────────────────────────────────────────────────
--
-- Hvert eneste kall fra appen slår opp den innloggede her.
create index if not exists personer_nav_bruker_idx
  on public.personer (nav_bruker_id);

-- Historikken på personsiden i adminbordet. Alle handlinger på en person
-- skriver personId i detaljene.
create index if not exists hendelseslogg_person_idx
  on public.hendelseslogg ((detaljer->>'personId'), tid desc);

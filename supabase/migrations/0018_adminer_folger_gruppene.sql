-- ═══════════════════════════════════════════════════════════
-- Adminer følger gruppene, som alle andre
--
-- 0017 ga enhver aktiv admin alle sidene i appen. Eier la seg selv i
-- «Vanlig ansatt» og så likevel alt, mens adminbordet viste den ene siden
-- gruppa gir. Eiers regel fra 01.10.2026: gruppene bestemmer for alle,
-- også adminer. Ingen ser alt.
--
-- `alle_sider` blir stående, alltid false. Appen ber om kolonnen, og en
-- kolonne som mangler gir en feil appen leser som «ingen kontakt».
--
-- En admin uten personrad slipper fortsatt inn (0014), men ser ingenting.
-- Kontoen kan ikke legges i en gruppe før den har en personrad.
--
-- Kjøres i SQL-editoren i navet. Kan kjøres flere ganger.
-- ═══════════════════════════════════════════════════════════

create or replace view public.min_status
with (security_invoker = false) as
  select p.status,
         p.navn,
         p.epost,
         false as alle_sider
    from public.personer p
   where p.nav_bruker_id = auth.uid()

  union all

  select 'godkjent'::text,
         a.navn,
         a.epost,
         false
    from public.admin_brukere a
   where a.id = auth.uid()
     and a.aktiv
     and not exists (
       select 1
         from public.personer p2
        where p2.nav_bruker_id = auth.uid()
     );

-- `create or replace view` kan tilbakestille rettighetene, se 0014
revoke all on public.min_status from anon;
grant select on public.min_status to authenticated;

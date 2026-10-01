-- ═══════════════════════════════════════════════════════════
-- Ingen egen vei inn i appen for adminer
--
-- 0014 slapp en aktiv admin inn i mobilappen uten personrad og uten
-- godkjenning. Eiers regel fra 01.10.2026: det skal ikke være noen ny
-- admin i appen. Alle registrerer seg, blir godkjent og lagt i grupper –
-- adminer også.
--
-- En admin uten personrad får nå ingen rad i min_status. Appen viser
-- «Noe gikk galt» med «Logg ut», slik den gjorde før 0014. Adminbordet
-- merker ingenting: innloggingen der leser admin_brukere, ikke denne.
--
-- Erstatter 0018 helt. Kjøres i SQL-editoren i navet. Kan kjøres flere
-- ganger, også uten at 0018 er kjørt først.
-- ═══════════════════════════════════════════════════════════

create or replace view public.min_status
with (security_invoker = false) as
  select p.status,
         p.navn,
         p.epost,
         -- Alltid false (0018). Står fordi appen ber om kolonnen.
         false as alle_sider
    from public.personer p
   where p.nav_bruker_id = auth.uid();

-- `create or replace view` kan tilbakestille rettighetene, se 0014
revoke all on public.min_status from anon;
grant select on public.min_status to authenticated;

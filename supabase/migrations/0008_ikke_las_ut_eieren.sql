-- ═══════════════════════════════════════════════════════════
-- Adminbordets egen tilgangsvei skal ikke være skrivbar fra matrisen.
--
-- 0006 ga den kan_skrive = true, «for symmetri». Det var en feil, og en av den
-- farlige sorten fordi den ser ryddig ut:
--
--   * taBortTilgang setter aktiv = false når veien har en aktivkolonne.
--   * er_admin() og er_eier() i 0001_init.sql krever aktiv = true.
--   * skrivSpørring går gjennom Management-API-et, som kjører som eier og
--     omgår RLS – så at admin_brukere mangler insert- og delete-policy stopper
--     ingenting.
--
-- Summen er at ett klikk på «Ta bort tilgang» i Adminbord-kolonnen ville
-- deaktivert den ENESTE eieren, og da er det ingen igjen som kan sette den
-- tilbake. Ingen advarsel, ingen «siste eier»-sperre, og ingen vei tilbake
-- utenom Supabase-konsollet.
--
-- Veien beholdes som LESBAR: matrisen skal fortsatt kunne vise at eieren er
-- eier. Det var hele grunnen til at den ble lagt inn i 0005.
-- ═══════════════════════════════════════════════════════════

update public.tilgangsoppsett t
   set kan_skrive = false,
       notat = 'Adminbordets egen tabell, i denne basen. Se 0001_init.sql.'
         || E'\n\nLESES, MEN SKRIVES IKKE. taBortTilgang ville satt aktiv=false,'
         || ' og er_admin()/er_eier() krever aktiv=true – så ett klikk kunne'
         || ' deaktivert den eneste eieren, uten noen igjen til å angre det.'
         || ' Management-API-et kjører som eier og omgår RLS, så at'
         || ' admin_brukere mangler policyer stopper det ikke. Adminbordets'
         || ' egne brukere hører på en egen flate, ikke i en matrise som'
         || ' ellers snakker med fremmede produksjonstabeller.'
  from public.systemer s
 where s.id = t.system_id
   and s.slug = 'adminbord';

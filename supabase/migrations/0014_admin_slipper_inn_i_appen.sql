-- ═══════════════════════════════════════════════════════════
-- En adminbord-admin skal slippe inn i mobilappen
--
-- Triggeren `ny_appbrukar` hopper med vilje over kontoer uten navn i
-- metadataene, slik at en admin opprettet i Supabase-panelet ikke havner i
-- godkjenningskøen. Det er riktig for køen, men har en bivirkning ingen
-- tenkte på: admin-kontoen har da ingen rad i `personer`, og `min_status`
-- gir null rader. Appen tolker det som en mislykket registrering og viser
-- feilskjermen.
--
-- Det er feil svar på et spørsmål som ikke er en feil. Kontoen er bare
-- ikke en appkonto - og den som administrerer systemene skal åpenbart
-- kunne åpne dem.
--
-- MERK KONSEKVENSEN: med denne endringen får enhver AKTIV rad i
-- `admin_brukere` tilgang til appen automatisk, uten godkjenning. Det er
-- med vilje - den som kan godkjenne alle andre trenger ikke godkjenne seg
-- selv - men det betyr at å opprette en admin også er å gi tilgang til
-- appen. `aktiv` er bryteren: settes den av, forsvinner begge deler.
-- ═══════════════════════════════════════════════════════════

create or replace view public.min_status
with (security_invoker = false) as
  -- Den vanlige veien: du har registrert deg i appen.
  select p.status,
         p.navn,
         p.epost
    from public.personer p
   where p.nav_bruker_id = auth.uid()

  union all

  -- Reserveveien: du administrerer systemene, men har aldri registrert deg.
  -- Bare når det ikke finnes en personrad - ellers ville en admin som ER
  -- registrert fått to rader, og appen leser den første.
  select 'godkjent'::text,
         a.navn,
         a.epost
    from public.admin_brukere a
   where a.id = auth.uid()
     and a.aktiv
     and not exists (
       select 1
         from public.personer p2
        where p2.nav_bruker_id = auth.uid()
     );

-- Supabase gir anon, authenticated og service_role select på objekter i
-- `public` automatisk, og en `create or replace view` kan tilbakestille
-- rettighetene. Derfor settes de på nytt her.
revoke all on public.min_status from anon;
grant select on public.min_status to authenticated;

-- ═══════════════════════════════════════════════════════════
-- SmartDok: bare endringer, hele lista én gang i døgnet
--
-- SmartDok ber om at jevnlig synk bruker `updatedSince` i stedet for å hente
-- hele prosjektlista hvert kvarter. Synken trenger da å huske hvor langt den
-- har kommet, og når den sist hentet alt.
-- ═══════════════════════════════════════════════════════════

alter table public.smartdok_tilkobling
  -- Starttidspunktet for siste henting som ble lest inn uten feil. Neste
  -- henting spør etter endringer siden da, med overlapp.
  add column if not exists hentet_til timestamptz,
  -- Hele lista hentes når denne er eldre enn et døgn, som sikkerhetsnett for
  -- det et endringskall kan ha gått glipp av.
  add column if not exists sist_hele timestamptz;

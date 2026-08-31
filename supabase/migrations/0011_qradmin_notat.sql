-- ═══════════════════════════════════════════════════════════
-- Retter notatet på qr-admin. Jeg tok feil om årsaken.
--
-- 0010 slo fast at `supabase_read_only_user` hadde «mistet passordet sitt» og
-- at databasepassordet måtte tilbakestilles i konsollet. Grunnlaget var to
-- observasjoner av
--
--   FATAL: 28P01: password authentication failed for user
--          "supabase_read_only_user"
--
-- Målt etterpå: 12 av 12 lesespørringer gikk gjennom, og cron-en fikk svar på
-- «select 1» i 259 ms. Feilen er altså FORBIGÅENDE, ikke permanent – og et
-- notat som ber om en passordtilbakestilling sender feilsøkingen et sted den
-- ikke skal.
--
-- Hvorfor det ikke er kritisk: pause-klokka er sju døgn, og cron-en kjører
-- hver morgen. Ett livstegn i uka er nok, så seks bomskudd på rad er greit.
-- Det som ville vært et problem er om feilen var permanent, og den er den ikke.
--
-- livstegn_tabell = 'profiles' blir stående. Den sparer en oppdagelsesspørring
-- uansett, og gjør at livstegnet går gjennom selv når lesespørringen bommer.
-- ═══════════════════════════════════════════════════════════

update public.systemer
   set notat = 'Next.js med Capacitor for iOS og Android. Står ikke i menyen –'
         || ' sjekk om den er i bruk.'
         || E'\n\nLESESPØRRINGEN BOMMER INNIMELLOM: Management-APIet svarer'
         || ' av og til «FATAL: 28P01: password authentication failed for user'
         || ' supabase_read_only_user». Målt 2026-08-31: to bom, deretter 12 av'
         || ' 12 gjennom. FORBIGÅENDE – ikke et ødelagt passord, og ingenting'
         || ' som skal tilbakestilles. Bommer den, mangler nøkkeltallene på'
         || ' systemsiden akkurat da.'
         || E'\n\nlivstegn_tabell er satt til profiles. REST-veien bruker ikke'
         || ' lesebrukeren, så livstegnet går gjennom uansett – og pause-klokka'
         || ' er sju døgn, mens cron-en kjører hver morgen.'
         || E'\n\nStår uten tilsyn med vilje. Merk at livstegnet IKKE lenger'
         || ' filtreres på tilsyn: «ikke varsle meg» skal ikke bety «la den dø».'
 where slug = 'qr-admin';

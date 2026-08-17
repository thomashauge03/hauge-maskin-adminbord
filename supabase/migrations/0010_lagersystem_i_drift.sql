-- ═══════════════════════════════════════════════════════════
-- Lagersystemet er i drift igjen, og registeret må vite hvor det bor.
--
-- 0005 slo fast at lagersystem (phxrxhdfyotqbknqsbnl) var PAUSET og at
-- adminbordet ikke kunne lese noe fra den. Den databasen er nå tømt og
-- innholdet flyttet inn i heimesidas prosjekt, fordi Supabase sin gratisplan
-- bare gir to aktive prosjekter – og grensen gjelder per BRUKER på tvers av
-- organisasjoner, ikke per organisasjon. Kilden står pauset som fasit fram
-- til 18. aug 2027.
--
-- Alt under er målt 2026-08-17 mot Management-API-et og Vercel-API-et, ikke
-- lest ut av en .env-fil. Se 0005 for hvorfor den forskjellen betyr noe.
-- ═══════════════════════════════════════════════════════════


-- ── 1. Systemer kan dele database ──
--
-- Til nå har hvert system eid databasen sin alene, og tabellista på
-- systemsiden spurte hardkodet etter `public`. Det holder ikke lenger:
-- lagersystemet ligger i skjemaet `lager` i heimesidas prosjekt. Uten dette
-- feltet ville systemsiden for Lagersystem vist heimesidas 16 tabeller og
-- kalt dem lagerets egne – verre enn å vise ingenting, fordi det ser riktig ut.
--
-- Default 'public' gjør at de elleve andre systemene ikke merker endringen,
-- og at nye systemer treffer det normale uten at noen fyller ut noe.
alter table public.systemer
  add column if not exists db_skjema text not null default 'public';

comment on column public.systemer.db_skjema is
  'Postgres-skjemaet systemets egne tabeller ligger i. Nesten alltid public. '
  'Settes bare når systemet deler database med et annet.';

-- Skjemanavn går inn i en SQL-streng i lib/systemdetalj.ts. Apostrofer dobles
-- der, men et format-krav her er billigere enn å stole på at det aldri glipper.
alter table public.systemer
  drop constraint if exists systemer_db_skjema_format;

alter table public.systemer
  add constraint systemer_db_skjema_format
  check (db_skjema ~ '^[a-z_][a-z0-9_]*$');


-- ── 2. Lagersystemet peker et nytt sted ──
--
-- konto_id arves fra heimeside i stedet for å skrives inn: det ER samme
-- prosjekt, under samme innlogging. Skulle heimesidas konto flytte seg
-- senere, er det nå én rad å rette og ikke to som stille går fra hverandre.
--
-- Vercel-prosjektet er uendret (stock-smart), men ID-en manglet i registeret.
-- Den er hentet nå, fordi helse.ts kobler på ID først og på navn bare som
-- reserve – et prosjekt som døpes om ville ellers blitt «finnes ikke».
update public.systemer
   set supabase_prosjekt_ref = 'uimvobhdoawqyokgdfcb',
       supabase_url          = 'https://uimvobhdoawqyokgdfcb.supabase.co',
       db_skjema             = 'lager',
       konto_id              = (select konto_id from public.systemer
                                 where slug = 'heimeside'),
       vercel_prosjekt_id    = 'prj_e5RfrjhTJEc6RCLXfwUGZ5NAAEE7',
       vercel_prosjekt_navn  = 'stock-smart',
       github_repo           = 'thomashauge03/stock-smart',
       produksjons_url       = 'https://stock-smart-pi.vercel.app',
       beskrivelse           = 'Stock Smart. Lageroversikt med QR-koder: '
                                 || 'hva vi har inne, hva som er brukt opp og '
                                 || 'hva som må bestilles.',
       -- Sto med false siden 0002, fordi systemet var halvferdig og pauset.
       -- Nå er det i drift og skal lyse rødt når det ikke er det.
       overvakes             = true,
       aktiv                 = true,
       notat                 = 'Deler database med heimeside '
         || '(uimvobhdoawqyokgdfcb). Lagerets egne tabeller ligger i skjemaet '
         || '«lager»; heimesidas i «public». Ingen fremmednøkler krysser '
         || 'mellom dem.'
         || E'\n\nRoller tildeles i public.user_roles og gjelder BEGGE systemene: '
         || '«admin» gir heimesida og lageret, «lager» gir full tilgang til '
         || 'lageret alene, «staff» kan lese og skrive men ikke slette, '
         || '«viewer» kan bare lese. Visningen lager.user_roles oversetter til '
         || 'appens egen admin/staff/viewer-modell.'
         || E'\n\nauth.users er felles for de to systemene – ett Supabase-prosjekt '
         || 'har én autentiseringsbase. En bruker uten rad i public.user_roles '
         || 'har ingen rettigheter noe sted.'
         || E'\n\nBrukertall, databasestørrelse og disk på systemsiden gjelder '
         || 'hele prosjektet, altså begge systemene. Bare tabellista er '
         || 'lagerets egen.'
         || E'\n\nMigreringen ligger i C:\\Users\\thoma\\hovedside-lager-migrering '
         || 'med README som forklarer oppsettet. Gammelt prosjekt '
         || 'phxrxhdfyotqbknqsbnl står pauset som fasit til 18. aug 2027.',
       endret                = now()
 where slug = 'lagersystem';


-- ── 3. Heimeside eier fortsatt public ──
--
-- Ingen endring i praksis, siden default er 'public'. Skrives likevel
-- eksplisitt: den dagen noen lurer på om lager-skjemaet hører til heimeside,
-- skal registeret svare på det uten at man må lese denne fila.
update public.systemer
   set notat = coalesce(notat || E'\n\n', '')
         || 'Deler database med lagersystem. Heimesidas tabeller ligger i '
         || '«public»; lagerets i «lager». Sletter man et system her, '
         || 'forsvinner ikke det andre – de deler bare prosjekt.',
       endret = now()
 where slug = 'heimeside';

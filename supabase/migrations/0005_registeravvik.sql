-- ═══════════════════════════════════════════════════════════
-- Retter registeret der det ikke stemte med virkeligheten.
--
-- Alt her er målt mot Supabase Management-API-et med alle fire kontoenes
-- tokens, ikke sluttet fra kode eller .env-filer. Forrige gang en ref ble
-- fastslått fra en .env-fil var den feil, og det tok tre forsøk å oppdage.
-- ═══════════════════════════════════════════════════════════


-- ── 1. En ref som ikke finnes ──
--
-- tilbudssystem-gammel sto med nniwtdgasyhhagsoxnqw. Det prosjektet finnes
-- IKKE hos noen av de fire Supabase-kontoene – ikke pauset, ikke skjult,
-- bare ikke der. Enten er det slettet, eller ref-en var feilskrevet.
--
-- Ref-en nulles framfor å gjettes. Under liffebiffen@gmail.com ligger
-- glioytjnzwxrvuqszrul «Hauge Maskin Tilbudside» (INACTIVE), som passer
-- beskrivelsen – men den er PAUSET, så innholdet kan ikke leses for å
-- bekrefte det uten å starte den. Å skrive inn en ref vi ikke har verifisert
-- er nettopp feilen som ble gjort sist.
update public.systemer
   set supabase_prosjekt_ref = null,
       supabase_url = null,
       konto_id = null,
       notat = 'Står ikke i menyen lenger.'
         || E'\n\nREF MANGLER. Registeret pekte på nniwtdgasyhhagsoxnqw, som ikke'
         || ' finnes hos noen av de fire kontoene (målt 2026-08-12 mot'
         || ' /v1/projects med alle fire tokens). Sannsynlig kandidat er'
         || ' glioytjnzwxrvuqszrul «Hauge Maskin Tilbudside» under'
         || ' liffebiffen@gmail.com, men den er INACTIVE og kan ikke leses'
         || ' for å bekrefte det uten å startes. Sett ref-en når den er'
         || ' bekreftet – ikke før.'
 where slug = 'tilbudssystem-gammel';


-- ── 2. Pauset, ikke ødelagt ──
--
-- lagersystem (phxrxhdfyotqbknqsbnl) står som INACTIVE. Det er grunnen til at
-- lesespørringer mot den svarer «Connection terminated due to connection
-- timeout» – en pauset base tar ikke imot tilkoblinger. Uten dette notatet
-- ser feilen ut som et nettverksproblem, og man leter på feil sted.
update public.systemer
   set notat = 'Lenken i sider.json går til vercel.com/.../stock-smart, altså'
         || ' dashbordet og ikke appen. Ser ut som noe halvferdig.'
         || E'\n\nPAUSET. Prosjektet står INACTIVE (målt 2026-08-12). Derfor'
         || ' svarer alle spørringer mot den «Connection terminated due to'
         || ' connection timeout» – det er en pauset base, ikke et'
         || ' nettverksproblem. Må startes fra Supabase-konsollet før'
         || ' adminbordet kan lese noe fra den.'
 where slug = 'lagersystem';


-- ── 3. En påstand som ikke holdt ──
--
-- Notatet på leveringseddel sa at den lokale .env i hauge-maskin-grus peker
-- på «et ANNET prosjekt under en annen konto». Første delen stemmer, andre
-- delen var en antakelse: erpcayowvmdcsbpdilak finnes ikke hos noen av de
-- fire kontoene. Da snakker appen lokalt ikke med feil database – den får
-- ingen database i det hele tatt.
update public.systemer
   set notat = 'Heter haugemaskin-grus i repoet, Leveringseddel i menyen.'
         || ' Vite + React. Tilgang i system_users, nøklet på e-post.'
         || E'\n\nRef-en er verifisert ved å telle rader: 348 deliveries,'
         || ' 41 inventory, 30 product_prices.'
         || E'\n\nADVARSEL: den lokale .env i hauge-maskin-grus peker på'
         || ' erpcayowvmdcsbpdilak. Den ref-en finnes IKKE hos noen av de fire'
         || ' kontoene (målt 2026-08-12), så en lokal kjøring når ingen'
         || ' database – den feiler, den treffer ikke feil base. Rett .env til'
         || ' mrdcsqlmxftwgdjdogxv.'
 where slug = 'leveringseddel';


-- ── 4. Adminbordet kjenner sin egen tilgangsmodell ──
--
-- Matrisen på /brukere viste «tilgang uvisst» for adminbordet selv, fordi
-- systemet manglet tilgangsoppsett. Det er unødvendig uvisshet: tabellen er
-- public.admin_brukere i denne basen, og den er definert i 0001_init.sql.
--
-- Oppsettet legges inn selv om adminbordet leser sin egen base direkte med
-- service role-nøkkelen. Grunnen er at matrisen skal kunne si HVILKEN rolle
-- noen har her, på samme måte som for de andre systemene, framfor å ha
-- adminbordet som et hull i sin egen oversikt.
insert into public.tilgangsoppsett (
  system_id, skjema, tabell, bruker_kolonne, bruker_nokkel,
  rolle_kolonne, aktiv_kolonne, ekstra_kolonner, notat
)
select s.id, 'public', 'admin_brukere', 'id', 'auth_id',
       'rolle', 'aktiv',
       -- navn og epost er NOT NULL i 0001_init.sql, så en insert uten dem
       -- feiler. ma_bytte_passord settes med vilje: en bruker opprettet
       -- herfra har et passord noen andre kjenner.
       '{"navn": "{{navn}}", "epost": "{{epost}}", "ma_bytte_passord": true}'::jsonb,
       'Adminbordets egen tabell, i denne basen. Se 0001_init.sql.'
  from public.systemer s
 where s.slug = 'adminbord'
   and not exists (
     select 1 from public.tilgangsoppsett t where t.system_id = s.id
   );

insert into public.system_roller (system_id, verdi, etikett, beskrivelse, er_standard, sortering)
select s.id, r.verdi, r.etikett, r.beskrivelse, r.er_standard, r.sortering
  from public.systemer s
  cross join (values
    ('eier',  'Eier',  'Kan alt: nøkler, brukere i andre systemer, tokenbytte.', false, 10),
    ('drift', 'Drift', 'Ser status og kan starte målinger, men ikke lese nøkler eller endre brukere.', true, 20)
  ) as r(verdi, etikett, beskrivelse, er_standard, sortering)
 where s.slug = 'adminbord'
on conflict (system_id, verdi) do nothing;

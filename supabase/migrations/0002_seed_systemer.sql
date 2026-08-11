-- ═══════════════════════════════════════════════════════════
-- Systemene som fantes da adminbordet ble laget
--
-- Verdiene er lest ut av .env-filene og git-remotene i de andre
-- repoene på maskinen. Vercel-ID-ene mangler for de fleste, fordi bare
-- to av repoene har en .vercel/project.json lokalt. De hentes inn med
-- «Oppdag»-knappen på /systemer så snart VERCEL_TOKEN er satt – det er
-- mer pålitelig enn å skrive dem av her.
--
-- Ingen nøkler ligger i denne fila. Anon- og service role-nøkler
-- legges inn gjennom grensesnittet, som krypterer dem først.
--
-- `on conflict do nothing` gjør at fila kan kjøres om igjen uten å
-- overskrive endringer gjort i adminbordet etterpå.
-- ═══════════════════════════════════════════════════════════

insert into public.systemer (
  slug, navn, beskrivelse,
  supabase_prosjekt_ref, supabase_url,
  vercel_prosjekt_id, vercel_prosjekt_navn,
  github_repo, produksjons_url,
  sortering, overvakes, notat
) values

  ('utleie', 'Utleie', 'Maskinutleie med QR-kode på maskinen, retur og verkstedsoppfølging.',
   'xghaogvmohevcgvnapvu', 'https://xghaogvmohevcgvnapvu.supabase.co',
   'prj_6LmoaYAZbFapg0mdoMNcWl25VYET', 'utleie-hauge-maskin',
   'thomashauge03/Utleie-HaugeMaskin', null,
   10, true, 'Next.js 16. Har egen admin-innlogging med rollene admin og service.'),

  ('grus', 'Grus', 'Grussalg med lager, priser, leveringer og faktura.',
   'erpcayowvmdcsbpdilak', 'https://erpcayowvmdcsbpdilak.supabase.co',
   null, null,
   'thomashauge03/haugemaskin-grus', null,
   20, true, 'Vite + React. Har super_admin-rolle i egen tabell.'),

  ('rorlager', 'Rørlager', 'Lager for rørdeler med QR-etiketter, ordre og faktura.',
   'xxnumwvkrmoqwduwmdrh', 'https://xxnumwvkrmoqwduwmdrh.supabase.co',
   null, null,
   'thomashauge03/rorlager', null,
   30, true, 'Vite + React. Egen admin-innlogging.'),

  ('tilbudssystem', 'Tilbudssystem', 'Tilbud og kunder, med signering og fakturagrunnlag.',
   'nniwtdgasyhhagsoxnqw', 'https://nniwtdgasyhhagsoxnqw.supabase.co',
   null, null,
   'thomashauge03/hauge-tilbudssystem', null,
   40, true, null),

  ('tilbudssystem-mal', 'Tilbudssystem (mal)', 'Flerkundeversjonen av tilbudssystemet, brukt som mal for nye kunder.',
   'rmlczuhipndlvfvkpznm', 'https://rmlczuhipndlvfvkpznm.supabase.co',
   null, null,
   'thomashauge03/tilbudssystem-mal', null,
   50, false, 'Mal, ikke i daglig drift. Overvåkes ikke, så den ikke lyser rødt uten grunn.'),

  ('qr-admin', 'QR-admin', 'Administrasjon av QR-koder, også pakket som mobilapp.',
   'thypecauthhleewecgfu', 'https://thypecauthhleewecgfu.supabase.co',
   null, null,
   'thomashauge03/qr-admin', null,
   60, true, 'Next.js med Capacitor for iOS og Android.'),

  ('tegningsmaler', 'Tegningsmaler', 'Maler for tegninger. Ingen database.',
   null, null,
   'prj_DCtod5H9FYG3fpM0o56DNURvypPt', 'tegningsmaler',
   'thomashauge03/tegningsmaler', null,
   70, true, 'Ren frontend på Vercel. Bare Vercel-status er relevant her.'),

  ('smartdok-to-pdf', 'SmartDok til PDF', 'Gjør SmartDok-eksport om til PDF. Ingen database.',
   null, null,
   null, null,
   'thomashauge03/smartdok-to-pdf', null,
   80, false, null),

  ('hauge-maskin-app', 'Hauge Maskin App', 'Samleapp. Ingen database.',
   null, null,
   null, null,
   'thomashauge03/hauge-maskin-app', null,
   90, false, null),

  ('perm-etikett', 'Perm-etikett', 'Etiketter til permer. Én HTML-fil, ingen database.',
   null, null,
   null, null,
   'thomashauge03/etikett-mal', null,
   100, false, null)

on conflict (slug) do nothing;

-- ═══════════════════════════════════════════════════════════
-- Systemene som fantes da adminbordet ble laget
--
-- Verdiene er lest ut av .env-filene og git-remotene i de andre
-- repoene, og produksjonsadressene fra sideliste-fila i
-- hauge-maskin-app (`sider.json`), som er den lista appen faktisk
-- bruker. Der navnene sprikte, er det navnet fra sider.json som gjelder:
-- det er det Thomas ser i menyen hver dag.
--
-- To ting er lett å ta feil av her:
--   * «Leveringseddel» er grus-appen. Repoet heter haugemaskin-grus,
--     men ingen kaller den grus i bruk.
--   * Den LEVENDE tilbudssiden er tilbudssystem-mal, altså
--     flerkundeversjonen. hauge-tilbudssystem er forgjengeren og står
--     ikke i menyen lenger.
--
-- Vercel-ID-ene mangler for de fleste, fordi bare to av repoene har en
-- .vercel/project.json lokalt. Resten kobles på navn til VERCEL_TOKEN er
-- satt; da fyller «Oppdag» dem inn.
--
-- Ingen nøkler ligger i denne fila. De legges inn gjennom
-- grensesnittet, som krypterer dem først.
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

  -- ── De fire som skal inn i den felles innloggingen ──

  ('tilbudssystem', 'Tilbudssystem', 'Tilbud og kunder, med signering og fakturagrunnlag. Flere kunder i samme base.',
   'rmlczuhipndlvfvkpznm', 'https://rmlczuhipndlvfvkpznm.supabase.co',
   null, 'tilbudssystem-mal',
   'thomashauge03/tilbudssystem-mal', 'https://tilbudssystem-mal.vercel.app/dashboard',
   10, true,
   'FLERKUNDE. Data skilles på tenant_id, og tenant_users kobler auth-bruker til kunde via current_tenant_id(). Den felles innloggingen skal bare gjelde Hauge Maskin-tenanten – andre kunder beholder sin egen innlogging.'),

  ('leveringseddel', 'Leveringseddel', 'Grussalg med lager, priser, leveringssedler og faktura.',
   'erpcayowvmdcsbpdilak', 'https://erpcayowvmdcsbpdilak.supabase.co',
   null, 'haugemaskin-grus',
   'thomashauge03/haugemaskin-grus', 'https://haugemaskin-grus.vercel.app/admin',
   20, true,
   'Heter haugemaskin-grus i repoet, Leveringseddel i menyen. Vite + React. Rollen ligger i super_admin_users.'),

  ('utleie', 'Utleie', 'Maskinutleie med QR-kode på maskinen, retur og verkstedsoppfølging.',
   'xghaogvmohevcgvnapvu', 'https://xghaogvmohevcgvnapvu.supabase.co',
   'prj_6LmoaYAZbFapg0mdoMNcWl25VYET', 'utleie-hauge-maskin',
   'thomashauge03/Utleie-HaugeMaskin', 'https://utleie-hauge-maskin.vercel.app/admin',
   30, true,
   'Next.js 16. Rollene admin og service i admin_brukere.'),

  ('rorlager', 'Rørlager', 'Lager for rørdeler med QR-etiketter, ordre og faktura.',
   'xxnumwvkrmoqwduwmdrh', 'https://xxnumwvkrmoqwduwmdrh.supabase.co',
   null, 'rorlager',
   'thomashauge03/rorlager', 'https://rorlager.vercel.app/admin',
   40, true,
   'Vite + React. Rollen ligger i admin_brukere.'),

  -- ── Resten ──

  ('etikett-lager', 'Etikett lager', 'Etikettgenerator for prosjektpermer. Ingen database.',
   null, null,
   null, null,
   'thomashauge03/etikett-mal', 'https://etikett.techauge.no/',
   50, true, 'Én HTML-fil. Egen domene, ikke Vercel-adresse.'),

  ('tegningsmaler', 'Tegningsmaler', 'Maler for tegninger. Ingen database.',
   null, null,
   'prj_DCtod5H9FYG3fpM0o56DNURvypPt', 'tegningsmaler',
   'thomashauge03/tegningsmaler', 'https://tegningsmaler.vercel.app/',
   60, true, 'Ren frontend på Vercel. Bare Vercel-status er relevant her.'),

  ('smartdok-til-pdf', 'Smartdok til PDF', 'Gjør SmartDok-eksport om til PDF.',
   null, null,
   null, null,
   'thomashauge03/smartdok-to-pdf', 'https://smartdok-to-pdf.lovable.app',
   70, false,
   'Ligger på Lovable, ikke Vercel. Derfor kan verken Supabase- eller Vercel-status hentes – nettsidesjekk er det eneste som ville virket.'),

  ('heimeside', 'Hauge Maskin – heimeside', 'Nettsiden utad.',
   null, null,
   null, null,
   null, 'https://hm-web-craft.lovable.app',
   80, false, 'Ligger på Lovable.'),

  ('lagersystem', 'Lagersystem', 'Stock Smart. Står i menyen, men lenken peker på Vercel-konsollet – ikke på appen.',
   null, null,
   null, 'stock-smart',
   null, null,
   90, false,
   'Lenken i sider.json går til vercel.com/.../stock-smart, altså dashbordet og ikke appen. Ser ut som noe halvferdig. Sjekk om den skal ryddes bort.'),

  ('tilbudssystem-gammel', 'Tilbudssystem (gammel)', 'Forgjengeren til tilbudssystemet, uten flerkundestøtte.',
   'nniwtdgasyhhagsoxnqw', 'https://nniwtdgasyhhagsoxnqw.supabase.co',
   null, null,
   'thomashauge03/hauge-tilbudssystem', null,
   200, false,
   'Står ikke i menyen lenger. Databasen lever fortsatt og koster penger – vurder om den kan pauses eller slettes når dataene er sikret.'),

  ('qr-admin', 'QR-admin', 'Administrasjon av QR-koder, også pakket som mobilapp.',
   'thypecauthhleewecgfu', 'https://thypecauthhleewecgfu.supabase.co',
   null, null,
   'thomashauge03/qr-admin', null,
   210, false,
   'Next.js med Capacitor for iOS og Android. Står ikke i menyen – sjekk om den er i bruk.'),

  ('hauge-maskin-app', 'Hauge Maskin-appen', 'Samleappen med sidelista. Selve menyen de andre startes fra.',
   null, null,
   null, null,
   'thomashauge03/hauge-maskin-app', null,
   220, false,
   'Sidelista ligger i sider.json i repoet, og er kilden til produksjonsadressene over.')

on conflict (slug) do nothing;

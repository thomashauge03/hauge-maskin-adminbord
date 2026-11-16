-- ═══════════════════════════════════════════════════════════
-- Brøytesystemet inn i brukerstyringen.
--
-- Systemet ble lagt inn fra gjøremålslista uten database, og /brukere viser
-- bare systemer med prosjektreferanse – så det fantes ingen vei til å gi noen
-- tilgang til brøytingen herfra.
--
-- Målt mot den levende basen og haugemaskinbroyting/db/migrasjoner 2026-11-16:
--
--   * Brøytingen bor i skjemaet `broyting` i navet (rxlkybaarxvyrrkkzjhj),
--     samme prosjekt og konto som adminbordet og kalenderen.
--   * broyting.bruker (auth_id → auth.users, navn, epost, rolle, aktiv) ER
--     tilgangen. auth.users deles med de andre appene, så en konto i navet
--     slipper ikke inn i brøytingen uten en rad her.
--   * rolle har en CHECK: admin, leder, sjafor, kunde.
--   * navn og epost er NOT NULL uten default, derfor ekstra_kolonner – samme
--     mønster som utleiens admin_brukere.
--   * Triggeren vern_siste_admin stopper en deaktivering som ville latt
--     brøytingen stå uten admin. Feilen kommer fram i panelet som den er.
-- ═══════════════════════════════════════════════════════════

update public.systemer s
   set supabase_prosjekt_ref = 'rxlkybaarxvyrrkkzjhj',
       supabase_url          = 'https://rxlkybaarxvyrrkkzjhj.supabase.co',
       db_skjema             = 'broyting',
       konto_id              = (select konto_id from public.systemer where slug = 'adminbord'),
       github_repo           = coalesce(s.github_repo, 'thomashauge03/haugemaskinbroyting'),
       notat                 = 'Bor i skjemaet broyting i navet, ved siden av adminbordet.'
                               || ' Tilgang er en rad i broyting.bruker.'
 where s.slug = 'broytesystem'
   and s.supabase_prosjekt_ref is null;


insert into public.tilgangsoppsett (
  system_id, skjema, tabell, bruker_kolonne, bruker_nokkel,
  rolle_kolonne, aktiv_kolonne, modell, etikett, kan_skrive, sortering,
  ekstra_kolonner, notat
)
select s.id, 'broyting', 'bruker', 'auth_id', 'auth_id',
       'rolle', 'aktiv', 'rolletabell', 'Brøyterolle', true, 10,
       jsonb_build_object('navn', '{{navn}}', 'epost', '{{epost}}'),
       'broyting.bruker. Raden er tilgangen: en konto i navet alene slipper ikke inn.'
         || E'\n\nNøklet på auth-id. Kontoen er felles med adminbordet og de andre'
         || ' appene i navet, så de fleste finnes alt.'
         || E'\n\n«Ta bort» setter aktiv = false, som brøyteappens egen knapp'
         || ' «Deaktiver». Raden står, så økter og avkrysninger beholder navnet.'
  from public.systemer s
 where s.slug = 'broytesystem'
on conflict (system_id, etikett) do nothing;


-- Sjåfør er standard: av de ansattes roller er det den som ser minst.
insert into public.system_roller (system_id, verdi, etikett, beskrivelse, er_standard, sortering)
select s.id, r.verdi, r.etikett, r.beskrivelse, r.er_standard, r.sortering
  from public.systemer s
  cross join (values
    ('admin',  'Admin',
     'Alt, også brukere og innstillinger i brøyteappen.',
     false, 10),
    ('leder',  'Leder',
     'Oversikt, kalender, økter, rapporter, ruter, kunder og kjøretøy. Kan også brøyte.',
     false, 20),
    ('sjafor', 'Sjåfør',
     'Dagens brøyteplan og egne økter.',
     true, 30),
    ('kunde',  'Kunde',
     'Egne steder: om det er brøytet, bilde, si opp eller bestille datoer.',
     false, 40)
  ) as r(verdi, etikett, beskrivelse, er_standard, sortering)
 where s.slug = 'broytesystem'
on conflict (system_id, verdi) do nothing;

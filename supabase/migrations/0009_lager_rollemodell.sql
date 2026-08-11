-- ═══════════════════════════════════════════════════════════
-- Leveringseddel og Rørlager har nå en ekte rollemodell.
--
-- 0006 satte dem til modell 'kun_konto' fordi det var sant da: hver policy på
-- hver datatabell var `to authenticated using (true)`, og system_users var et
-- passivt register ingen leste. Å gi tilgang skrev en rad uten virkning.
--
-- Det er rettet i appene selv, i migrasjonen 20260812090000_tilgangsmodell.sql
-- i hvert repo. Nå gjelder:
--
--   * hm_har_tilgang() – rad i system_users, eller super admin – brukes av
--     HVER policy på hver datatabell.
--   * Alle SECURITY DEFINER-funksjonene har fått samme vakt. De omgår RLS, og
--     i leveringseddelen hadde de ingen sjekk i det hele tatt – ikke engang
--     «er du logget inn». Uten den vakten ville policyene vært uten virkning
--     for den som gikk gjennom RPC.
--   * Dagens brukere ble lagt inn FØR strammingen, så ingen ble låst ut.
--
-- Verifisert mot de levende basene 2026-08-12: en innlogget bruker uten rad
-- ser 0 av 348 leveringssedler og 0 av 1 rørordre, får 42501 fra RPC-ene, og
-- får 0 rader truffet på skriving. Kundeflyten er urørt – katalogen svarer
-- fortsatt 200 med data til en anonym forespørsel.
--
-- Derfor kan tilgang nå GIS og TAS BORT herfra, og raden betyr noe.
-- ═══════════════════════════════════════════════════════════


-- ── Veien blir en rolletabell igjen, og denne gangen med virkning ──

update public.tilgangsoppsett t
   set modell = 'rolletabell',
       skjema = 'public',
       tabell = 'system_users',
       bruker_kolonne = 'email',
       bruker_nokkel = 'epost',
       rolle_kolonne = 'role',
       aktiv_kolonne = null,
       -- full_name er nullbar, men en rad uten navn gir en brukerliste i appen
       -- der alle heter «null». email er brukerkolonnen og kommer derfra.
       ekstra_kolonner = '{"full_name": "{{navn}}"}'::jsonb,
       etikett = 'Bruker',
       kan_skrive = true,
       sortering = 10,
       notat = 'Tilgang = rad i system_users, håndhevet av hm_har_tilgang() i'
         || ' hver policy og hver SECURITY DEFINER-funksjon. Se'
         || ' 20260812090000_tilgangsmodell.sql i appens eget repo.'
         || E'\n\nNøklet på E-POST, ikke auth-id: en rad kan legges inn før'
         || ' personen har registrert seg, og virker fra første innlogging.'
         || E'\n\nRollen lagres, men avgrenser ingenting ennå – se system_roller.'
  from public.systemer s
 where s.id = t.system_id
   and s.slug in ('leveringseddel', 'rorlager')
   and t.etikett = 'Alle med konto';


-- ── Rollene tilbake ──
--
-- Slettet i 0006 med den begrunnelsen at de ikke fantes i virkeligheten. Nå
-- lagres de, og hm_rolle() gir dem ut – men de AVGRENSER fortsatt ingenting.
-- Beskrivelsen sier det, slik at nedtrekkslisten ikke lover et nivå som ikke
-- finnes. Å skille dem krever en beslutning om hva en sjåfør ikke skal se.

insert into public.system_roller (system_id, verdi, etikett, beskrivelse, er_standard, sortering)
select s.id, r.verdi, r.etikett, r.beskrivelse, r.er_standard, r.sortering
  from public.systemer s
  cross join (values
    ('admin',  'Administrator', 'Full tilgang til admindelen.', true, 10),
    ('kontor', 'Kontor',
     'Registreres, men gir i dag SAMME tilgang som administrator – rollen avgrenser ingenting ennå.',
     false, 20),
    ('sjafor', 'Sjåfør',
     'Registreres, men gir i dag SAMME tilgang som administrator – rollen avgrenser ingenting ennå.',
     false, 30)
  ) as r(verdi, etikett, beskrivelse, er_standard, sortering)
 where s.slug = 'leveringseddel'
on conflict (system_id, verdi) do nothing;

insert into public.system_roller (system_id, verdi, etikett, beskrivelse, er_standard, sortering)
select s.id, r.verdi, r.etikett, r.beskrivelse, r.er_standard, r.sortering
  from public.systemer s
  cross join (values
    ('admin',  'Administrator', 'Full tilgang til admindelen.', true, 10),
    ('kontor', 'Kontor',
     'Registreres, men gir i dag SAMME tilgang som administrator – rollen avgrenser ingenting ennå.',
     false, 20),
    ('lager',  'Lager',
     'Registreres, men gir i dag SAMME tilgang som administrator – rollen avgrenser ingenting ennå.',
     false, 30)
  ) as r(verdi, etikett, beskrivelse, er_standard, sortering)
 where s.slug = 'rorlager'
on conflict (system_id, verdi) do nothing;


-- ── Notatet på super admin-veien presiseres ──
--
-- Den er fortsatt lesbar-bare, og grunnen er uendret: super_admins er retten
-- til å bestemme hvem ANDRE som slipper inn. Men nå står den ved siden av en
-- vei som faktisk virker, og forskjellen bør stå tydelig.

update public.tilgangsoppsett t
   set notat = 'Styrer /admin/brukere i appen, gjennom is_super_admin() som'
         || ' sammenligner lower(auth.jwt()->>''email''). Ingen rolle- eller'
         || ' aktivkolonne – å ha raden ER tilgangen.'
         || E'\n\nLESES, MEN SKRIVES IKKE: dette er retten til å bestemme hvem'
         || ' andre som slipper inn. Vanlig tilgang gis gjennom «Bruker», som'
         || ' skriver i system_users.'
         || E'\n\nEn super admin slipper inn UANSETT om hen står i'
         || ' system_users, siden hm_har_tilgang() sjekker begge.'
  from public.systemer s
 where s.id = t.system_id
   and s.slug in ('leveringseddel', 'rorlager')
   and t.etikett = 'Super admin';

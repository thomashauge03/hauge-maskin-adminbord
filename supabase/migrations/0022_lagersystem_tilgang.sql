-- ═══════════════════════════════════════════════════════════
-- Lagersystemet inn i tilgangsmatrisen.
--
-- Matrisen viste bare «konto» for Lagersystem, fordi registeret ikke visste
-- hvor tilgangen bor. Målt mot den levende basen (uimvobhdoawqyokgdfcb)
-- 2026-10-22:
--
--   * public.user_roles (user_id → auth.users, role public.app_role) med
--     UNIQUE (user_id, role). Én person kan altså ha FLERE rader – én per
--     rolle – i motsetning til de andre systemene, der raden er personen.
--   * lager.has_access() slipper inn admin, lager, staff og viewer.
--     lager.is_admin() er admin eller lager; can_write er i tillegg staff.
--   * «admin» er heimesidas admin OG lagerets. Tabellen er delt mellom de to
--     systemene, fordi de deler prosjekt.
--   * Appens egen rollebytter, lager.set_user_role(), bytter bare ut lager,
--     staff og viewer, og lar «admin» stå.
--
-- Adminbordet gjør det samme som appen: det skriver bare lagerrollene. Å gi
-- eller ta «admin» herfra ville endret heimesida i det stille.
-- ═══════════════════════════════════════════════════════════


-- ── Et rollefilter kan gjelde flere roller ──
--
-- rolle_filter (0007) tok én verdi, og passet plattform-admin i
-- tilbudssystemet. Lagerveien er «en av lager, staff, viewer» – tre verdier i
-- samme tabell som også holder heimesidas admin.
--
-- Ny kolonne framfor å endre typen på den gamle: koden som kjører nå, leser
-- rolle_filter som tekst, og en endret type ville knekt tilbudssystemets
-- matrise fram til ny kode var rullet ut. rolle_filter fjernes i en senere
-- migrasjon, når ingenting leser den lenger.
alter table public.tilgangsoppsett
  add column if not exists gjelder_roller text[];

comment on column public.tilgangsoppsett.gjelder_roller is
  'Bare rader med en av disse rolleverdiene hører til veien. Null = alle rader. '
  'På en vei adminbordet skriver i, betyr det også at et rollebytte bare bytter '
  'blant disse – andre roller personen har i samme tabell, står urørt.';

update public.tilgangsoppsett
   set gjelder_roller = array[rolle_filter]
 where rolle_filter is not null
   and gjelder_roller is null;

alter table public.tilgangsoppsett
  drop constraint if exists tilgangsoppsett_gjelder_roller_krever_kolonne;
alter table public.tilgangsoppsett
  add constraint tilgangsoppsett_gjelder_roller_krever_kolonne
  check (gjelder_roller is null or rolle_kolonne is not null);

comment on column public.tilgangsoppsett.rolle_filter is
  'Erstattet av gjelder_roller (0022). Leses ikke lenger.';


-- ── Lagerets to veier ──

insert into public.tilgangsoppsett (
  system_id, skjema, tabell, bruker_kolonne, bruker_nokkel,
  rolle_kolonne, aktiv_kolonne, modell, etikett, kan_skrive, sortering,
  gjelder_roller, notat
)
select s.id, 'public', 'user_roles', 'user_id', 'auth_id',
       'role', null, 'rolletabell', 'Lagerrolle', true, 10,
       array['lager', 'staff', 'viewer'],
       'public.user_roles, én rad per rolle. lager.has_access() slipper inn'
         || ' lager, staff og viewer (og admin, se den andre veien).'
         || E'\n\nEt rollebytte herfra bytter bare blant lager, staff og viewer,'
         || ' slik lager.set_user_role() i appen gjør. «admin» står urørt.'
         || E'\n\nNøklet på auth-id, så kontoen må finnes i prosjektet først. Den'
         || ' er felles med heimesida – ett prosjekt, én auth.users.'
  from public.systemer s
 where s.slug = 'lagersystem'
on conflict (system_id, etikett) do nothing;

insert into public.tilgangsoppsett (
  system_id, skjema, tabell, bruker_kolonne, bruker_nokkel,
  rolle_kolonne, aktiv_kolonne, modell, etikett, kan_skrive, sortering,
  gjelder_roller, notat
)
select s.id, 'public', 'user_roles', 'user_id', 'auth_id',
       'role', null, 'rolletabell', 'Admin (også heimesida)', false, 20,
       array['admin'],
       '«admin» i public.user_roles gir full tilgang til lageret OG til'
         || ' heimesidas admin. Tabellen er delt, fordi systemene deler prosjekt.'
         || E'\n\nLESES, MEN SKRIVES IKKE: å gi eller ta denne rollen herfra ville'
         || ' endret heimesida i det stille. Lagertilgang gis gjennom «Lagerrolle».'
  from public.systemer s
 where s.slug = 'lagersystem'
on conflict (system_id, etikett) do nothing;


-- ── Rollene, med appens egne navn ──
--
-- Verdiene er app_role-enumens. Etikettene følger lager.user_roles-visningen,
-- der «lager» heter admin i appen – men her må det skilles fra heimesidas.
-- viewer er standard: å gi for lite er lett å rette, å gi for mye blir ikke
-- oppdaget.

insert into public.system_roller (system_id, verdi, etikett, beskrivelse, er_standard, sortering)
select s.id, r.verdi, r.etikett, r.beskrivelse, r.er_standard, r.sortering
  from public.systemer s
  cross join (values
    ('lager',  'Lageradmin',
     'Full tilgang til lageret, også sletting og brukerstyring. Gir IKKE tilgang til heimesida.',
     false, 10),
    ('staff',  'Ansatt',
     'Kan lese og skrive i lageret, men ikke slette.',
     false, 20),
    ('viewer', 'Leser',
     'Kan bare lese lageret.',
     true, 30)
  ) as r(verdi, etikett, beskrivelse, er_standard, sortering)
 where s.slug = 'lagersystem'
on conflict (system_id, verdi) do nothing;

-- ═══════════════════════════════════════════════════════════
-- En tilgangsvei kan gjelde bare ÉN rolleverdi.
--
-- 0006 la inn plattform-admin-veien i tilbudssystemet som «tenant_users uten
-- tenant-filter». Det var for bredt: is_system_admin() krever role='admin',
-- mens veien slik den sto leste hver rad uansett rolle. Resultatet var at
-- ttanlegg@gmail.com – som er `member` hos sin egen kunde – ble vist som
-- plattform-admin over Hauge Maskin. Altså samme type feil som startet hele
-- denne runden: en visning som påsto mer makt enn som fantes.
--
-- Etikettene kortes ned samtidig. De havner i en celle i en tabell med sju
-- kolonner, og «Full tilgang (alle med konto) +1» er ikke noe man leser der.
-- Begrunnelsen hører i notatet, som vises når man åpner cellen.
-- ═══════════════════════════════════════════════════════════

/*
 * Bare rader der rollekolonnen har denne verdien teller som denne veien.
 *
 * Null = alle rader teller, som er riktig for de fleste veiene: å ha raden ER
 * tilgangen. Satt bare der en enkelt rolleverdi utløser noe eget – slik
 * `admin` i tenant_users utløser plattform-makt gjennom en funksjon uten
 * tenant-filter.
 */
alter table public.tilgangsoppsett
  add column if not exists rolle_filter text;

alter table public.tilgangsoppsett
  drop constraint if exists tilgangsoppsett_rollefilter_krever_kolonne;
alter table public.tilgangsoppsett
  add constraint tilgangsoppsett_rollefilter_krever_kolonne
  check (rolle_filter is null or rolle_kolonne is not null);


-- ── Plattform-admin gjelder bare role='admin' ──

update public.tilgangsoppsett t
   set rolle_filter = 'admin',
       etikett = 'Plattform-admin',
       notat = 'is_system_admin() spør tenant_users UTEN tenant-filter, men'
         || ' KREVER role=''admin''. Derfor leses denne veien uten'
         || ' tenant-vilkår og med rollefilter: en admin hos en annen kunde'
         || ' har full makt over Hauge Maskin-dataene, inkludert'
         || ' admin_delete_tenant. En `member` hos en annen kunde har det'
         || ' ikke, og skal ikke vises som om han hadde.'
         || E'\n\nSkrives ikke: å gi plattform-admin er å gi tilgang til andre'
         || ' bedrifters data.'
  from public.systemer s
 where s.id = t.system_id
   and s.slug = 'tilbudssystem'
   and t.etikett = 'Plattform-admin (alle kunder)';


-- ── Kortere etiketter. Begrunnelsen ligger i notatet. ──

update public.tilgangsoppsett t
   set etikett = 'Alle med konto'
  from public.systemer s
 where s.id = t.system_id
   and s.slug in ('leveringseddel', 'rorlager')
   and t.etikett = 'Full tilgang (alle med konto)';

update public.tilgangsoppsett t
   set etikett = 'Medlem'
  from public.systemer s
 where s.id = t.system_id
   and s.slug = 'tilbudssystem'
   and t.etikett = 'Medlem av Hauge Maskin';

update public.tilgangsoppsett t
   set etikett = 'Admin'
  from public.systemer s
 where s.id = t.system_id
   and s.slug = 'utleie'
   and t.etikett = 'Admin-bruker';

update public.tilgangsoppsett t
   set etikett = 'Adminbord'
  from public.systemer s
 where s.id = t.system_id
   and s.slug = 'adminbord'
   and t.etikett = 'Adminbordbruker';

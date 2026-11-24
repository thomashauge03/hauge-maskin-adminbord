-- ═══════════════════════════════════════════════════════════
-- Smartdok til PDF inn i brukerstyringen.
--
-- Appen er flyttet fra Lovable til Vercel og låst bak innlogging mot navet.
-- /brukere viser bare systemer med prosjektreferanse, så uten denne fantes det
-- ingen vei til å gi noen tilgang herfra.
--
-- Målt mot migrasjonene 0001, 0002, 0003, 0006 og smartdok-to-pdf 2026-11-24:
--
--   * Appen bruker navet (rxlkybaarxvyrrkkzjhj), samme prosjekt og konto som
--     adminbordet. auth.users deles, så en konto i navet slipper ikke inn
--     uten en rad i public.smartdok_pdf_tilgang.
--   * Tabellen har bruker_id (→ auth.users), navn, epost og aktiv. Navn og
--     epost er NOT NULL uten default, derfor ekstra_kolonner.
--   * Det finnes ingen rolle: å ha en aktiv rad ER tilgangen, så
--     rolle_kolonne er null.
--   * systemer har ingen kolonne som heter url; adressen står i
--     produksjons_url. Seed-raden (0002) pekte på Lovable og hadde aktiv =
--     false. hentSystemer() filtrerer på aktiv, så uten aktiv = true her
--     blir systemet usynlig under Brukere. overvakes er urørt (default true):
--     systemet vises nå i systemlista og kommer med i statussjekkene.
--   * Oppdateringen er ubetinget på slug, så den også retter en rad som er
--     redigert for hånd. Å kjøre den på nytt setter samme verdier.
--   * Vercel-prosjektet står i smartdok-to-pdf/.vercel/project.json.
-- ═══════════════════════════════════════════════════════════

update public.systemer s
   set supabase_prosjekt_ref = 'rxlkybaarxvyrrkkzjhj',
       supabase_url          = 'https://rxlkybaarxvyrrkkzjhj.supabase.co',
       produksjons_url       = 'https://smartdok-to-pdf.vercel.app',
       vercel_prosjekt_id    = 'prj_zGvg1oOgKh0gebXlUTbGnEOl6ipP',
       vercel_prosjekt_navn  = 'smartdok-to-pdf',
       konto_id              = coalesce(s.konto_id,
                                        (select konto_id from public.systemer where slug = 'adminbord')),
       aktiv                 = true,
       notat                 = 'Ligger på Vercel og bruker navet, ved siden av adminbordet.'
                               || ' Tilgang er en rad i smartdok_pdf_tilgang.'
 where s.slug = 'smartdok-til-pdf';


insert into public.tilgangsoppsett (
  system_id, skjema, tabell, bruker_kolonne, bruker_nokkel,
  rolle_kolonne, aktiv_kolonne, modell, etikett, kan_skrive, sortering,
  ekstra_kolonner, notat
)
select s.id, 'public', 'smartdok_pdf_tilgang', 'bruker_id', 'auth_id',
       null, 'aktiv', 'rolletabell', 'Tilgang', true, 10,
       jsonb_build_object('navn', '{{navn}}', 'epost', '{{epost}}'),
       'public.smartdok_pdf_tilgang. Raden er tilgangen: en konto i navet alene slipper ikke inn.'
         || E'\n\nIngen roller: en aktiv rad gir full bruk av appen.'
         || E'\n\n«Ta bort» setter aktiv = false. Raden står, så kontoen kan'
         || ' slås på igjen uten å legges inn på nytt.'
  from public.systemer s
 where s.slug = 'smartdok-til-pdf'
on conflict (system_id, etikett) do nothing;

-- ═══════════════════════════════════════════════════════════
-- Når tokenet UTLØPER, ikke når vi sist rørte det.
--
-- Rotasjonspåminnelsen regnet fra `sist_bekreftet`, altså sist tokenet ble
-- prøvd. Det er feil grunnlag på to måter:
--
--   1. `sist_bekreftet` flytter seg hver gang tokenet testes, så nedtellingen
--      nullstilte seg selv uten at tokenet var byttet.
--   2. Den målte eierens EGEN 30-dagers rutine. Nå har tokenene en ekte
--      utløpsdato satt hos Supabase, og den gjelder uansett hva vi mener.
--
-- Forskjellen er ikke akademisk: et utløpt token stopper ALT. Status,
-- brukerlister, tilgangsskriving – og livstegnet, så prosjektene begynner å
-- pauses noen dager senere. Det er den dyreste feilen adminbordet kan ha, og
-- den kommer uten forvarsel.
--
-- MÅ REGISTRERES FOR HÅND. Management-API-et oppgir ikke utløp noe sted –
-- prøvd /v1/profile, /v1/access-tokens, /v1/profile/access-tokens, /v1/tokens
-- og /v1/oauth/tokens, alle 404 utenom profile, som bare gir e-post. Og
-- `sbp_`-tokenet er opakt, ikke et JWT, så det finnes ingen `exp` å lese.
--
-- To felt framfor ett, fordi det speiler måten datoen faktisk er kjent:
-- «laget den 12. august, varer 30 dager». Med bare en utløpsdato måtte eieren
-- regne selv, og en regnefeil her er en dag hele oppsettet står stille.
-- ═══════════════════════════════════════════════════════════

alter table public.supabase_kontoar
  add column if not exists token_opprettet date,
  add column if not exists token_gyldig_dager integer;

comment on column public.supabase_kontoar.token_opprettet is
  'Datoen tokenet ble laget hos Supabase. Ikke datoen det ble limt inn her.';
comment on column public.supabase_kontoar.token_gyldig_dager is
  'Levetid i dager, slik den ble valgt hos Supabase. Null = ingen utløpsdato.';

alter table public.supabase_kontoar
  drop constraint if exists supabase_kontoar_gyldig_dager;
alter table public.supabase_kontoar
  add constraint supabase_kontoar_gyldig_dager
  check (token_gyldig_dager is null or token_gyldig_dager between 1 and 3650);

/*
 * Utløpet som en generert kolonne.
 *
 * Regnet ut i databasen framfor i hver visning: nedtellingen vises på
 * innstillingssiden, i påminnelsen øverst, og – etter dette – på forsiden.
 * Tre steder som regner det samme blir før eller senere tre steder som er
 * uenige, og da vet ingen hvilket som har rett.
 *
 * `date + integer` er immutable i Postgres, så den kan lagres.
 */
alter table public.supabase_kontoar
  drop column if exists token_utloper;
alter table public.supabase_kontoar
  add column token_utloper date
  generated always as (token_opprettet + token_gyldig_dager) stored;

comment on column public.supabase_kontoar.token_utloper is
  'Utregnet: token_opprettet + token_gyldig_dager. Null når noe av det mangler – og da er utløpet UVISST, ikke fjernt.';

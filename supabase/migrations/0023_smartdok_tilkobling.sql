-- ═══════════════════════════════════════════════════════════
-- Nøkkelen til SmartDok-API-et
--
-- Prosjektlista hentes rett fra SmartDok hvert kvarter, i stedet for at noen
-- må eksportere til Excel og laste opp. Nøkkelen ligger kryptert her, ikke i
-- en miljøvariabel, av to grunner:
--
--   1. Synken fornyer den selv. SmartDok gir nøkler som varer i ett år, og
--      fornyingen gjør den gamle ugyldig i samme øyeblikk. Lå den i Vercel,
--      måtte noen lime inn den nye og rulle ut på nytt før neste kjøring.
--   2. Samme regel som for de andre systemenes nøkler: en databasedump uten
--      KRYPTONOKKEL er verdiløs.
--
-- Én rad, fordi Hauge Maskin har én SmartDok-konto.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.smartdok_tilkobling (
  id smallint primary key default 1 check (id = 1),
  -- Null betyr ikke satt opp. Da hopper synken over SmartDok og går videre
  -- med lista slik den står, og Excel-opplastingen er fortsatt veien inn.
  nokkel_kryptert text,
  hint text,
  /*
   * Datoen nøkkelen ble laget i SmartDok, eller sist fornyet av synken.
   * SmartDok tillater fornying først etter seks måneder, og nøkkelen dør
   * etter tolv. Begge regnes herfra, så den må være dagen nøkkelen ble
   * laget, ikke dagen den ble limt inn.
   */
  nokkel_opprettet date,
  endret timestamptz not null default now()
);

alter table public.smartdok_tilkobling
  drop column if exists nokkel_utloper;
alter table public.smartdok_tilkobling
  add column nokkel_utloper date
  generated always as (nokkel_opprettet + 365) stored;

insert into public.smartdok_tilkobling (id) values (1) on conflict do nothing;

create trigger smartdok_tilkobling_endret
  before update on public.smartdok_tilkobling
  for each row execute function public.sett_endret();

-- Radsikkerhet på, ingen policy: leses bare av server-kode med service role,
-- som `hemmeligheter` og `supabase_kontoar`.
alter table public.smartdok_tilkobling enable row level security;

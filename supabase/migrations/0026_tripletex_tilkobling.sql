-- ═══════════════════════════════════════════════════════════
-- Nøkkelen til Tripletex, for internbelastningen
--
-- Se docs/superpowers/specs/2026-11-02-internbelastning-design.md.
-- Adminbordet skal føre bilag med maskintimer fra SmartDok på prosjektene
-- og lese hovedboka til rapporten om administrasjonskostnaden.
--
-- Egen nøkkel, ikke den grusappen bruker. Den ligger som hemmelighet i
-- grusappens edge-funksjon og kan ikke leses ut, og med hver sin nøkkel kan
-- den ene trekkes tilbake i Tripletex uten at den andre stopper.
--
-- Kryptert her av samme grunn som SmartDok-nøkkelen (0023): en databasedump
-- uten KRYPTONOKKEL er verdiløs, og et bytte krever ingen ny utrulling.
--
-- Én rad, fordi Hauge Maskin har ett regnskap.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.tripletex_tilkobling (
  id smallint primary key default 1 check (id = 1),
  -- Null betyr ikke satt opp.
  nokkel_kryptert text,
  hint text,
  -- Det nøkkelen så da den ble prøvd, så siden kan vise hvilket regnskap den
  -- peker på uten å bruke nøkkelen ved hver visning.
  firma text,
  endret timestamptz not null default now()
);

insert into public.tripletex_tilkobling (id) values (1) on conflict do nothing;

drop trigger if exists tripletex_tilkobling_endret on public.tripletex_tilkobling;
create trigger tripletex_tilkobling_endret
  before update on public.tripletex_tilkobling
  for each row execute function public.sett_endret();

-- Radsikkerhet på, ingen policy: leses bare av server-kode med service role,
-- som smartdok_tilkobling.
alter table public.tripletex_tilkobling enable row level security;

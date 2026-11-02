-- ═══════════════════════════════════════════════════════════
-- Internbelastning, steg 1: startdato og listen «belastes ikke»
--
-- Se docs/superpowers/specs/2026-11-02-internbelastning-design.md, valg 3,
-- 4 og 6. Steg 1 regner og viser bare; ingenting sendes til Tripletex, så
-- her er ingen kjøringer eller bilag ennå.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.internbelastning_innstilling (
  id smallint primary key default 1 check (id = 1),
  -- Timer datert før denne dagen sendes aldri. Måneder før vises bare.
  startdato date not null default date '2026-11-01',
  endret timestamptz not null default now()
);

insert into public.internbelastning_innstilling (id) values (1) on conflict do nothing;

drop trigger if exists internbelastning_innstilling_endret on public.internbelastning_innstilling;
create trigger internbelastning_innstilling_endret
  before update on public.internbelastning_innstilling
  for each row execute function public.sett_endret();

/*
 * Maskiner som ikke skal belastes, eller en hel kategori fra SmartDok.
 *
 * Finnes fordi SmartDok ikke skiller mellom en sats på 0 noen har skrevet med
 * vilje og en sats ingen har fylt inn. Uten listen måtte koden gjette, og en
 * gjetning gir enten stille nullbeløp eller en kjøring som aldri kan
 * godkjennes. Nå bestemmer et menneske det én gang, og det huskes.
 *
 * Maskin-id og kategori er SmartDoks egne verdier. Navnet er bare til visning,
 * så listen kan leses selv om SmartDok er nede.
 */
create table if not exists public.internbelastning_unntak (
  id uuid primary key default gen_random_uuid(),
  maskin_id integer unique,
  kategori text unique,
  navn text not null,
  grunn text not null check (length(btrim(grunn)) > 0),
  lagt_inn_av text,
  opprettet timestamptz not null default now(),
  check ((maskin_id is null) <> (kategori is null))
);

-- Valg 4 og 6 i designnotatet. Lastebilene Scania R770 og Volvo FH16 står
-- med vilje ikke her: de skal få sats i SmartDok.
insert into public.internbelastning_unntak (maskin_id, kategori, navn, grunn, lagt_inn_av) values
  (null, 'Firmabiler', 'Kategori Firmabiler', 'Firmabilene belastes ikke prosjektene (valg 4).', 'oppsett'),
  (79619, null, '100122 Innleid 8 tonner', 'Innleid: leien kommer på prosjektet via fakturaen (valg 6).', 'oppsett'),
  (79620, null, '100123 Innleid 15 tonner', 'Innleid: leien kommer på prosjektet via fakturaen (valg 6).', 'oppsett'),
  (79621, null, '100124 Innleide 25 tonner', 'Innleid: leien kommer på prosjektet via fakturaen (valg 6).', 'oppsett'),
  (81891, null, '100208 Innleid Dumper', 'Innleid: leien kommer på prosjektet via fakturaen (valg 6).', 'oppsett'),
  (81865, null, '100414 Innleid Henger', 'Innleid: leien kommer på prosjektet via fakturaen (valg 6).', 'oppsett'),
  (82800, null, '100415 Innleid 3 aksla bil', 'Innleid: leien kommer på prosjektet via fakturaen (valg 6).', 'oppsett'),
  (82801, null, '100416 Innleid 4 aksla bil', 'Innleid: leien kommer på prosjektet via fakturaen (valg 6).', 'oppsett'),
  (172409, null, '100616 Innleie Traktor', 'Innleid: leien kommer på prosjektet via fakturaen (valg 6).', 'oppsett')
on conflict do nothing;

-- Radsikkerhet på, ingen policy: leses og skrives bare av server-kode med
-- service role, som tilkoblingstabellene.
alter table public.internbelastning_innstilling enable row level security;
alter table public.internbelastning_unntak enable row level security;

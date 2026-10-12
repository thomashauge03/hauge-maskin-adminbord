-- ═══════════════════════════════════════════════════════════
-- Felles prosjektliste
--
-- Fem apper hadde hver sin prosjekttabell, fylt inn for hånd, og ingen av dem
-- var lik SmartDok. Denne tabellen er fasiten: SmartDok-eksporten leses inn
-- her, og synken skriver den ut til lager, rørlager, utleie, tilbud og
-- varsling. Prosjekter som opprettes i en av appene, hentes hit og sendes
-- videre til de andre.
--
-- Prosjektnummeret er nøkkelen, ikke en egen id i hver app. Det er det eneste
-- de fem tabellene og SmartDok har felles, og det står allerede i
-- tilbudssystemets 16 prosjekter.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.prosjekter (
  id uuid primary key default gen_random_uuid(),
  -- Ingen mellomrom: «2026 117» og «2026117» skal ikke kunne bli to prosjekter.
  nummer text not null unique check (nummer ~ '^[^\s]{1,40}$'),
  navn text not null check (length(btrim(navn)) between 1 and 200),
  kunde text,
  adresse text,
  aktiv boolean not null default true,
  -- 'smartdok', 'adminbord' eller sluggen til appen prosjektet ble funnet i.
  kilde text not null default 'adminbord',
  opprettet timestamptz not null default now(),
  endret timestamptz not null default now()
);

create trigger prosjekter_endret
  before update on public.prosjekter
  for each row execute function public.sett_endret();

alter table public.prosjekter enable row level security;

-- Lesing for innloggede admins. All skriving går via service role i server
-- actions, fordi en endring her skal synkes ut, og synken trenger nøklene.
create policy "admin ser prosjekter" on public.prosjekter for select using (public.er_admin());

-- ── Lås og siste kjøring ────────────────────────────────────
-- Synken kjøres av pg_cron hvert kvarter, etter hver import og fra knappen.
-- To samtidige kjøringer ville begge sett at et prosjekt mangler i utleie og
-- satt det inn to ganger. Utleie har ingen unik indeks på nummer som kunne
-- stoppet det, så låsen må ligge her.
create table if not exists public.prosjekt_synk (
  id smallint primary key default 1 check (id = 1),
  laast_til timestamptz,
  sist_startet timestamptz,
  sist_ferdig timestamptz,
  sist_resultat jsonb
);

insert into public.prosjekt_synk (id) values (1) on conflict do nothing;

alter table public.prosjekt_synk enable row level security;
create policy "admin ser prosjekt_synk" on public.prosjekt_synk for select using (public.er_admin());

-- Tar låsen hvis den er ledig eller utløpt. Utløpet er der fordi en kjøring
-- som dør midt i (tidsavbrudd på Vercel) ellers ville låst synken for godt.
create or replace function public.ta_prosjekt_synk_las(sekunder integer)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.prosjekt_synk
     set laast_til = now() + make_interval(secs => sekunder),
         sist_startet = now()
   where id = 1
     and (laast_til is null or laast_til < now())
  returning true;
$$;

revoke all on function public.ta_prosjekt_synk_las(integer) from public, anon, authenticated;

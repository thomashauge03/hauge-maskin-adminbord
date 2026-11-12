-- ═══════════════════════════════════════════════════════════
-- Gjøremål
--
-- En personlig huskeliste i adminbordet. Ikke en del av hendelsesloggen:
-- den skal ikke kunne endres, mens et gjøremål nettopp skal hukes av,
-- skrives om og slettes.
--
-- Hver admin ser bare sine egne. Det er en huskeliste, ikke en
-- oppgavefordeling, og en felles liste ville blitt full av andres halve
-- tanker.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.gjoremal (
  id uuid primary key default gen_random_uuid(),
  -- Default fra sesjonen, så klienten aldri sender inn hvem eieren er.
  eier uuid not null default auth.uid()
    references public.admin_brukere (id) on delete cascade,
  tittel text not null check (length(btrim(tittel)) between 1 and 300),
  notat text check (notat is null or length(notat) <= 4000),
  -- Tidspunkt framfor boolsk: «når ble dette gjort» er det man lurer på
  -- etterpå, og null betyr fortsatt åpent.
  gjort timestamptz,
  opprettet timestamptz not null default now(),
  endret timestamptz not null default now()
);

create index if not exists gjoremal_eier_idx on public.gjoremal (eier, gjort);

drop trigger if exists gjoremal_endret on public.gjoremal;
create trigger gjoremal_endret
  before update on public.gjoremal
  for each row execute function public.sett_endret();

alter table public.gjoremal enable row level security;

-- er_admin() i tillegg til eier-sjekken: en deaktivert admin skal ikke nå
-- sine gamle rader med en sesjon som ennå ikke er utløpt.
drop policy if exists "admin ser egne gjoremal" on public.gjoremal;
create policy "admin ser egne gjoremal"
  on public.gjoremal for select
  using (eier = auth.uid() and public.er_admin());

drop policy if exists "admin skriver egne gjoremal" on public.gjoremal;
create policy "admin skriver egne gjoremal"
  on public.gjoremal for insert
  with check (eier = auth.uid() and public.er_admin());

drop policy if exists "admin endrer egne gjoremal" on public.gjoremal;
create policy "admin endrer egne gjoremal"
  on public.gjoremal for update
  using (eier = auth.uid() and public.er_admin())
  with check (eier = auth.uid());

drop policy if exists "admin sletter egne gjoremal" on public.gjoremal;
create policy "admin sletter egne gjoremal"
  on public.gjoremal for delete
  using (eier = auth.uid() and public.er_admin());

-- ═══════════════════════════════════════════════════════════
-- Grupper: sjåfør, kontor, verksted
--
-- Uten dette må hver nyansatt krysses av mot hver side, og med tretten sider
-- og tjue personer er det tre hundre kryss ingen holder styr på. Med grupper
-- får en ny person riktig liste ved å settes i én gruppe.
--
-- Per-person-unntak forsvinner ikke. De er fortsatt der for de få tilfellene
-- som ikke passer i noen gruppe - og de veier tyngst, se regelen nederst.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.grupper (
  id uuid primary key default gen_random_uuid(),
  navn text not null unique,
  beskrivelse text,
  sortering integer not null default 100,
  opprettet timestamptz not null default now(),
  endret timestamptz not null default now()
);

-- Hvilke sider gruppa gir. Bare sider som IKKE er standard trenger å stå her -
-- standardsidene får alle uansett - men vi hindrer det ikke, fordi en side kan
-- gå fra standard til utvalgt senere, og da skal gruppa fortsatt gjelde.
create table if not exists public.gruppe_sider (
  gruppe_id uuid not null references public.grupper (id) on delete cascade,
  side_id text not null,
  opprettet timestamptz not null default now(),
  primary key (gruppe_id, side_id)
);

create table if not exists public.person_gruppe (
  person_id uuid not null references public.personer (id) on delete cascade,
  gruppe_id uuid not null references public.grupper (id) on delete cascade,
  opprettet timestamptz not null default now(),
  primary key (person_id, gruppe_id)
);

create index if not exists gruppe_sider_side_idx on public.gruppe_sider (side_id);
create index if not exists person_gruppe_gruppe_idx on public.person_gruppe (gruppe_id);

alter table public.grupper enable row level security;
alter table public.gruppe_sider enable row level security;
alter table public.person_gruppe enable row level security;

create policy "admin ser grupper" on public.grupper for select using (public.er_admin());
create policy "eier skriver grupper" on public.grupper for insert with check (public.er_eier());
create policy "eier endrer grupper" on public.grupper for update using (public.er_eier());
create policy "eier sletter grupper" on public.grupper for delete using (public.er_eier());

create policy "admin ser gruppe_sider" on public.gruppe_sider for select using (public.er_admin());
create policy "eier skriver gruppe_sider" on public.gruppe_sider for insert with check (public.er_eier());
create policy "eier sletter gruppe_sider" on public.gruppe_sider for delete using (public.er_eier());

create policy "admin ser person_gruppe" on public.person_gruppe for select using (public.er_admin());
create policy "eier skriver person_gruppe" on public.person_gruppe for insert with check (public.er_eier());
create policy "eier sletter person_gruppe" on public.person_gruppe for delete using (public.er_eier());

create trigger grupper_endret
  before update on public.grupper
  for each row execute function public.sett_endret();


-- ── Regelen appen spør om ─────────────────────────────────────
--
--   1. Har jeg et eget unntak for siden?  → det avgjør, uansett resten.
--   2. Er siden standard?                 → ja, jeg ser den.
--   3. Gir en av gruppene mine den?       → ja, jeg ser den.
--   4. Ellers                             → nei.
--
-- Visningen svarer bare på AVVIK fra standarden. En side som ikke er nevnt er
-- standard og skal vises, og det er derfor appen filtrerer på `syn !== false`
-- og ikke på `syn === true` - fraværet av en rad betyr ja.
--
-- Rekkefølgen på leddene er ikke kosmetikk. Uten `not exists`-vaktene ville en
-- side som er både ikke-standard, gitt av en gruppe OG gitt særskilt kommet
-- tilbake som flere rader med ulik verdi, og appen leser den første. Hvilken
-- det blir ville vært tilfeldig.
create or replace view public.mine_sideval
with (security_invoker = false) as
  -- 1. Mine egne unntak. Veier tyngst.
  select st.side_id,
         st.gi as syn
    from public.side_tilgang st
    join public.personer p on p.id = st.person_id
   where p.nav_bruker_id = auth.uid()

  union all

  -- 2. Ikke-standard sider som en av gruppene mine gir meg.
  --    distinct fordi samme side kan ligge i flere av gruppene mine.
  select distinct gs.side_id,
         true as syn
    from public.gruppe_sider gs
    join public.person_gruppe pg on pg.gruppe_id = gs.gruppe_id
    join public.personer p on p.id = pg.person_id
   where p.nav_bruker_id = auth.uid()
     and exists (
       select 1 from public.side_standard ss
        where ss.side_id = gs.side_id and not ss.standard
     )
     and not exists (
       select 1 from public.side_tilgang st2
         join public.personer p2 on p2.id = st2.person_id
        where p2.nav_bruker_id = auth.uid() and st2.side_id = gs.side_id
     )

  union all

  -- 3. Ikke-standard sider jeg verken har fått særskilt eller gjennom gruppe.
  select ss.side_id,
         false as syn
    from public.side_standard ss
   where not ss.standard
     and not exists (
       select 1 from public.side_tilgang st3
         join public.personer p3 on p3.id = st3.person_id
        where p3.nav_bruker_id = auth.uid() and st3.side_id = ss.side_id
     )
     and not exists (
       select 1 from public.gruppe_sider gs2
         join public.person_gruppe pg2 on pg2.gruppe_id = gs2.gruppe_id
         join public.personer p4 on p4.id = pg2.person_id
        where p4.nav_bruker_id = auth.uid() and gs2.side_id = ss.side_id
     );

revoke all on public.mine_sideval from anon;
grant select on public.mine_sideval to authenticated;
revoke all on public.grupper, public.gruppe_sider, public.person_gruppe
  from anon, authenticated;

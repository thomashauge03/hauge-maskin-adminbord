-- ═══════════════════════════════════════════════════════════
-- Hvem ser hvilke sider i mobilappen
--
-- MERK HVA SOM IKKE ER HER: sidene selv.
--
-- Den opprinnelige planen var å flytte sidelista fra sider.json og inn i
-- databasen. Det er forkastet, og grunnen er verdt å skrive ned: PC-en er
-- den primære plattformen, og skrivebordsappen har allerede en fungerende
-- redigering som skriver sider.json til GitHub. Å flytte fasiten hit ville
-- tatt bort det verktøyet, eller gitt to steder å redigere samme liste.
--
-- Derfor: sider.json er fortsatt fasit, og skrivebordsappen er fortsatt
-- stedet man legger til og endrer sider. Denne tabellen lagrer bare
-- unntakene, nøklet på side-id-en fra den fila.
--
-- Konsekvensen er at det ikke finnes noen fremmednøkkel til sidene. Slettes
-- en side i sider.json, blir radene her liggende som foreldreløse. Det er
-- en bevisst avveining - alternativet var å gjøre PC-en avhengig av denne
-- databasen - og adminbordet viser dem så de kan ryddes.
-- ═══════════════════════════════════════════════════════════


-- ── Sider som IKKE er standard ────────────────────────────────
--
-- En side er standard med mindre den står her. Det betyr at en ny side lagt
-- inn fra skrivebordsappen automatisk blir synlig for alle - som er riktig
-- standardoppførsel, og som gjør at ingen må huske å gjøre noe her etterpå.
create table if not exists public.side_standard (
  side_id text primary key,
  -- Alltid false i praksis. Kolonnen finnes for at raden skal si hva den
  -- betyr, i stedet for at tilstedeværelsen alene bærer meningen.
  standard boolean not null default false,
  begrunnelse text,
  opprettet timestamptz not null default now(),
  endret timestamptz not null default now()
);

alter table public.side_standard enable row level security;

create policy "admin ser side_standard"
  on public.side_standard for select using (public.er_admin());
create policy "eier skriver side_standard"
  on public.side_standard for insert with check (public.er_eier());
create policy "eier endrer side_standard"
  on public.side_standard for update using (public.er_eier());
create policy "eier sletter side_standard"
  on public.side_standard for delete using (public.er_eier());


-- ── Unntak per person ─────────────────────────────────────────
--
-- Bare rader der noen avviker fra standarden. En person uten rader her får
-- nøyaktig standardlista.
create table if not exists public.side_tilgang (
  person_id uuid not null references public.personer (id) on delete cascade,
  side_id text not null,

  -- true  = personen får denne i tillegg, selv om den ikke er standard
  -- false = personen får den ikke, selv om den er standard
  gi boolean not null,

  begrunnelse text,
  opprettet timestamptz not null default now(),
  endret timestamptz not null default now(),

  primary key (person_id, side_id)
);

create index if not exists side_tilgang_side_idx on public.side_tilgang (side_id);

alter table public.side_tilgang enable row level security;

create policy "admin ser side_tilgang"
  on public.side_tilgang for select using (public.er_admin());
create policy "eier skriver side_tilgang"
  on public.side_tilgang for insert with check (public.er_eier());
create policy "eier endrer side_tilgang"
  on public.side_tilgang for update using (public.er_eier());
create policy "eier sletter side_tilgang"
  on public.side_tilgang for delete using (public.er_eier());

create trigger side_standard_endret
  before update on public.side_standard
  for each row execute function public.sett_endret();

create trigger side_tilgang_endret
  before update on public.side_tilgang
  for each row execute function public.sett_endret();


-- ── Hva appen får vite ────────────────────────────────────────
--
-- Appen har sidelista fra sider.json allerede. Den trenger bare å vite hvilke
-- av dem den skal la være å vise, og hvilke den skal vise likevel. Derfor gir
-- denne visningen én rad per side som AVVIKER for den innloggede - resten
-- sier seg selv.
--
--   syn = false  →  skjul denne siden
--   syn = true   →  vis denne siden
--
-- En side som ikke finnes i svaret er standard, og skal vises.
create or replace view public.mine_sideval
with (security_invoker = false) as
  -- Mine egne unntak. De veier tyngst, og kommer derfor først.
  select st.side_id,
         st.gi as syn
    from public.side_tilgang st
    join public.personer p on p.id = st.person_id
   where p.nav_bruker_id = auth.uid()

  union all

  -- Sider som ikke er standard for noen, og som jeg ikke har fått særskilt.
  select ss.side_id,
         false as syn
    from public.side_standard ss
   where not ss.standard
     and not exists (
       select 1
         from public.side_tilgang st2
         join public.personer p2 on p2.id = st2.person_id
        where p2.nav_bruker_id = auth.uid()
          and st2.side_id = ss.side_id
     );

-- Supabase gir anon, authenticated og service_role select på nye objekter i
-- `public` automatisk. Det holder ikke å GI tilgang - det som trengs er å ta
-- den bort fra anon.
revoke all on public.mine_sideval from anon;
grant select on public.mine_sideval to authenticated;
revoke all on public.side_standard, public.side_tilgang from anon, authenticated;

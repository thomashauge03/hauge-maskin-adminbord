-- ═══════════════════════════════════════════════════════════
-- Gjøremål: frist, viktig og hvilket system det gjelder
--
-- Alle tre er valgfrie. Et gjøremål skal kunne skrives inn på ett sekund;
-- et påkrevd felt ville gjort lista til et skjema, og da blir den ikke brukt.
-- ═══════════════════════════════════════════════════════════

alter table public.gjoremal
  -- Dato, ikke tidspunkt: «innen fredag» er en dag. Med klokkeslett ville
  -- et gjøremål med frist i dag stått som forfalt fra kl. 00:01.
  add column if not exists frist date,
  add column if not exists viktig boolean not null default false,
  -- set null og ikke cascade: slettes et system fra registeret, er
  -- gjøremålet fortsatt noe som skal gjøres.
  add column if not exists system_id uuid references public.systemer (id) on delete set null;

create index if not exists gjoremal_system_idx on public.gjoremal (system_id) where system_id is not null;

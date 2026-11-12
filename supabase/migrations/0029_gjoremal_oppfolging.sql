-- ═══════════════════════════════════════════════════════════
-- Gjøremål: under oppfølging
--
-- Et gjøremål som er satt i gang, men ikke ferdig: noen er spurt, en sak er
-- meldt inn, man venter på svar. Uten merket så det ut som ingen hadde rørt
-- det, og det ble tatt opp på nytt.
--
-- Tidspunkt og ikke boolsk, av samme grunn som `gjort`: «siden når» er det
-- man lurer på når man lurer på om det er på tide å purre. Null = ikke under
-- oppfølging. Står igjen når gjøremålet hukes av, som historikk.
-- ═══════════════════════════════════════════════════════════

alter table public.gjoremal
  add column if not exists under_oppfolging_siden timestamptz;

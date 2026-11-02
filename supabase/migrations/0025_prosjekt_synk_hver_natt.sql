-- ═══════════════════════════════════════════════════════════
-- Prosjektsynken hver natt, ikke hvert kvarter
--
-- Prosjekter opprettes sjelden, og det som haster tas med Synk nå på
-- Prosjekter-siden. Hvert kvarter ga 96 kjøringer i døgnet mot SmartDok og
-- fem apper for nesten ingen endringer.
--
-- 04:00 UTC er 05:00 norsk vintertid og 06:00 sommertid: ferdig før folk
-- begynner å bestille. pg_cron regner i UTC.
-- ═══════════════════════════════════════════════════════════

select cron.alter_job(jobid, schedule := '0 4 * * *')
from cron.job
where jobname = 'prosjekt-synk';

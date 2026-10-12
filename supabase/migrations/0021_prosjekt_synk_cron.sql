-- ═══════════════════════════════════════════════════════════
-- Prosjektsynken hvert kvarter
--
-- Fra pg_cron i navet, ikke fra Vercel: Hobby-planen gir én cron i døgnet,
-- og den brukes av statusmålingen. Samme mønster som innboks-jobb.
--
-- Adressen og nøkkelen ligger i Vault, ikke her, så migrasjonen kan ligge i
-- git. De legges inn slik (nøkkelen er PROSJEKT_SYNK_NOKKEL på Vercel):
--
--   select vault.create_secret('https://hauge-maskin-adminbord.vercel.app/api/prosjekter/synk', 'prosjekt_synk_url');
--   select vault.create_secret('<nøkkelen>', 'prosjekt_synk_nokkel');
--
-- Uten dem gjør jobben ingenting, i stedet for å kalle en tom adresse.
-- ═══════════════════════════════════════════════════════════

select cron.unschedule('prosjekt-synk')
where exists (select 1 from cron.job where jobname = 'prosjekt-synk');

select cron.schedule(
  'prosjekt-synk',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'prosjekt_synk_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'prosjekt_synk_nokkel')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000)
  where exists (select 1 from vault.decrypted_secrets where name = 'prosjekt_synk_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'prosjekt_synk_nokkel');
  $$
);

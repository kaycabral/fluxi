-- Daily bank sync: pg_cron calls the `pluggy-sync` Edge Function through
-- pg_net at 09:00 UTC (06:00 America/Sao_Paulo). The function URL and its
-- token are read from Vault by name at run time (`pluggy_sync_url`,
-- `pluggy_sync_token`); their values are set out-of-band (docs/production.md),
-- never in git. pg_cron only runs in the database named by
-- `cron.database_name`, so any other database (the `fluxi_test` suite) skips
-- this whole migration. Idempotent: the job is replaced if it exists.
DO $migration$
BEGIN
  IF current_setting('cron.database_name', true) IS DISTINCT FROM current_database() THEN
    RAISE NOTICE 'pg_cron is not available in database %, skipping the sync schedule', current_database();
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pluggy-sync-daily') THEN
    PERFORM cron.unschedule('pluggy-sync-daily');
  END IF;

  PERFORM cron.schedule(
    'pluggy-sync-daily',
    '0 9 * * *',
    $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pluggy_sync_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-fluxi-sync-token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pluggy_sync_token')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    );
    $job$
  );
END
$migration$;

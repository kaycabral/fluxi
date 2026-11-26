-- Least-privileged role for the `pluggy-sync` Edge Function: it can only read
-- and write the two bank-feed tables (no other table, no `auth` schema). The
-- role is created NOLOGIN: the login + password are an out-of-band step
-- (docs/production.md in prod, `pnpm pluggy:env` locally), never in git.
-- Roles are cluster-wide, hence the guard (the test database shares them).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fluxi_sync') THEN
    CREATE ROLE fluxi_sync NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO fluxi_sync;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_feed_accounts, public.bank_transactions TO fluxi_sync;--> statement-breakpoint
-- RLS stays on: anon/authenticated keep zero policies (blocked). The role is
-- internal and per-user scoping is done by the writer with the configured
-- user id (every statement filters by it), so the policies are permissive.
CREATE POLICY bank_feed_accounts_sync ON public.bank_feed_accounts
  FOR ALL TO fluxi_sync USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY bank_transactions_sync ON public.bank_transactions
  FOR ALL TO fluxi_sync USING (true) WITH CHECK (true);

-- Runtime role of the Next.js app (#65). Until now the app connected as
-- `postgres`, the owner of every table (and BYPASSRLS on Supabase): a SQL
-- injection or a buggy query could read or change anything, run DDL, disable
-- RLS or reach `auth`, Vault and `cron`.
--
-- `fluxi_app` owns nothing and cannot bypass RLS. It gets DML on the app's
-- tables in `public` (no TRUNCATE/REFERENCES/TRIGGER, no DDL) and EXECUTE on
-- the three SECURITY DEFINER functions the app calls. Nothing in `auth`,
-- `vault`, `cron`, `net` or `storage`; no sequences (every id is a uuid
-- default).
--
-- Created NOLOGIN, like `fluxi_sync` (0014): login + password are an
-- out-of-band step (docs/production.md in prod; the integration suite sets a
-- local one per run). Roles are cluster-wide, hence the guard (the test
-- database shares them).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fluxi_app') THEN
    CREATE ROLE fluxi_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO fluxi_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.accounts,
  public.bank_entry_links,
  public.bank_feed_accounts,
  public.bank_feed_items,
  public.bank_transactions,
  public.banks,
  public.budget_group_targets,
  public.budget_groups,
  public.budget_versions,
  public.categories,
  public.categorization_rules,
  public.entries,
  public.entry_overrides,
  public.entry_parts,
  public.goals,
  public.occurrence_payments,
  public.profiles,
  public.spaces,
  public.undo_snapshots,
  public.user_settings
TO fluxi_app;--> statement-breakpoint
-- The definer functions the app calls: the personal space on first load
-- (`personalScope`), the defaults of a new space (`createSpace`) and the bank
-- feed materialization after a mapping change. They run as their owner; the
-- app only gets EXECUTE (and USAGE on `private` to resolve the name).
GRANT EXECUTE ON FUNCTION public.ensure_personal_space(uuid) TO fluxi_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.seed_space_defaults(uuid) TO fluxi_app;--> statement-breakpoint
GRANT USAGE ON SCHEMA private TO fluxi_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.materialize_bank_feed(uuid, uuid, date) TO fluxi_app;--> statement-breakpoint
-- RLS: the API roles (anon, authenticated) keep zero policies (blocked). The
-- app scopes every statement by the session's user and space in code (`Scope`,
-- `inScope`), so its policies are permissive, like `fluxi_sync`'s: what RLS
-- adds is that only the roles named in a policy see any row. FORCE makes the
-- tables obey RLS even for an owner without BYPASSRLS (`postgres` has it on
-- Supabase, so migrations and the definer functions are unaffected).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounts', 'bank_entry_links', 'bank_feed_accounts', 'bank_feed_items',
    'bank_transactions', 'banks', 'budget_group_targets', 'budget_groups',
    'budget_versions', 'categories', 'categorization_rules', 'entries',
    'entry_overrides', 'entry_parts', 'goals', 'occurrence_payments', 'profiles',
    'spaces', 'undo_snapshots', 'user_settings'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO fluxi_app USING (true) WITH CHECK (true)',
      t || '_app', t
    );
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;

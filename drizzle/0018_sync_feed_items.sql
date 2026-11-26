-- The `pluggy-sync` Edge Function records every configured bank connection in
-- `bank_feed_items` and reads the space it is routed to (null = unassigned:
-- nothing of it is stored). `fluxi_sync` gets exactly that: read, insert and
-- update on this table (no delete; no access to `spaces` — the composite FKs
-- are checked by Postgres itself). RLS stays on; the API roles keep zero
-- policies.
GRANT SELECT, INSERT, UPDATE ON public.bank_feed_items TO fluxi_sync;--> statement-breakpoint
CREATE POLICY bank_feed_items_sync ON public.bank_feed_items
  FOR ALL TO fluxi_sync USING (true) WITH CHECK (true);

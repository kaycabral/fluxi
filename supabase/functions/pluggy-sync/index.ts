// Supabase Edge Function: the daily Pluggy -> bank feed sync. All logic lives in
// the runtime-agnostic module below (shared with the Node test suites); this
// file only binds it to Deno. Called by pg_cron through pg_net with the
// `x-fluxi-sync-token` header (see drizzle/0015_sync_schedule.sql). Secrets are
// read per request, so `supabase secrets set` applies without a redeploy.
import { handleSyncRequest } from '../../../src/features/bank-feed/adapters/sync.ts'

Deno.serve((request) =>
  handleSyncRequest(request, Deno.env.toObject(), { log: (line) => console.log(line) }),
)

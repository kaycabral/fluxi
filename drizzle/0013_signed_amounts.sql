-- Ledger amounts become signed from the account's point of view (same
-- convention as the bank feed): negative = money leaves `account_id`. Expenses
-- and transfers flip to negative (a transfer's destination gets the opposite);
-- income stays positive. Overrides follow their entry, and so do the rows kept
-- in `undo_snapshots`, so an undo offered before this migration restores
-- amounts in the new convention.
ALTER TABLE "entries" DROP CONSTRAINT "entries_amount_positive";--> statement-breakpoint
ALTER TABLE "entry_overrides" DROP CONSTRAINT "entry_overrides_amount_positive";--> statement-breakpoint
UPDATE "entries" SET "amount_cents" = -"amount_cents" WHERE "kind" IN ('expense', 'transfer');--> statement-breakpoint
UPDATE "entry_overrides" o SET "amount_cents" = -o."amount_cents"
FROM "entries" e
WHERE e."id" = o."entry_id" AND e."user_id" = o."user_id"
  AND e."kind" IN ('expense', 'transfer') AND o."amount_cents" IS NOT NULL;--> statement-breakpoint
UPDATE "undo_snapshots" s SET
  "entries" = (
    SELECT coalesce(jsonb_agg(
      CASE WHEN x.e->>'kind' IN ('expense', 'transfer')
        THEN jsonb_set(x.e, '{amount_cents}', to_jsonb(-((x.e->>'amount_cents')::bigint)))
        ELSE x.e END
      ORDER BY x.ord), '[]'::jsonb)
    FROM jsonb_array_elements(s."entries") WITH ORDINALITY AS x(e, ord)
  ),
  "entry_overrides" = (
    SELECT coalesce(jsonb_agg(
      CASE WHEN x.o->>'amount_cents' IS NOT NULL AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(s."entries") AS en(e)
          WHERE en.e->>'id' = x.o->>'entry_id' AND en.e->>'kind' IN ('expense', 'transfer'))
        THEN jsonb_set(x.o, '{amount_cents}', to_jsonb(-((x.o->>'amount_cents')::bigint)))
        ELSE x.o END
      ORDER BY x.ord), '[]'::jsonb)
    FROM jsonb_array_elements(s."entry_overrides") WITH ORDINALITY AS x(o, ord)
  );--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_amount_nonzero" CHECK ("entries"."amount_cents" <> 0);--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_transfer_negative" CHECK ("entries"."kind" <> 'transfer' or "entries"."amount_cents" < 0);--> statement-breakpoint
ALTER TABLE "entry_overrides" ADD CONSTRAINT "entry_overrides_amount_nonzero" CHECK ("entry_overrides"."amount_cents" is null or "entry_overrides"."amount_cents" <> 0);

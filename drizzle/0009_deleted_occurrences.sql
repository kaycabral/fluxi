ALTER TABLE "entry_overrides" ADD COLUMN "deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "entry_overrides" ADD CONSTRAINT "entry_overrides_deleted_is_skipped" CHECK (not "entry_overrides"."deleted" or "entry_overrides"."skipped");--> statement-breakpoint
-- Backfill: until now "Só este mês" (delete one occurrence) wrote the same
-- skipped override the Notion import writes for its skipped months. A skip
-- the import wrote is untouched since that import's transaction (now() is the
-- transaction time, so its updated_at equals its entry's import_links
-- created_at); every other skip is a user deletion.
UPDATE "entry_overrides" AS o
SET "deleted" = true
WHERE o."skipped"
  AND NOT EXISTS (
    SELECT 1
    FROM "import_links" AS l
    WHERE l."entry_id" = o."entry_id"
      AND l."user_id" = o."user_id"
      AND l."created_at" = o."updated_at"
  );

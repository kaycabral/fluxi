ALTER TABLE "bank_feed_items" ADD COLUMN "item_status" text;--> statement-breakpoint
ALTER TABLE "bank_feed_items" ADD COLUMN "execution_status" text;--> statement-breakpoint
ALTER TABLE "bank_feed_items" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "bank_feed_items" ADD COLUMN "last_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bank_feed_items" ADD COLUMN "next_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bank_feed_items" ADD COLUMN "consent_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bank_feed_items" ADD COLUMN "institution_health" text;--> statement-breakpoint
ALTER TABLE "bank_feed_items" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bank_feed_items" ADD CONSTRAINT "bank_feed_items_status_codes" CHECK (("bank_feed_items"."item_status" is null or char_length("bank_feed_items"."item_status") <= 40)
        and ("bank_feed_items"."execution_status" is null or char_length("bank_feed_items"."execution_status") <= 60)
        and ("bank_feed_items"."error_code" is null or char_length("bank_feed_items"."error_code") <= 60)
        and ("bank_feed_items"."institution_health" is null or char_length("bank_feed_items"."institution_health") <= 20));--> statement-breakpoint
ALTER TABLE "bank_feed_items" ADD CONSTRAINT "bank_feed_items_checked" CHECK ("bank_feed_items"."item_status" is null or "bank_feed_items"."checked_at" is not null);
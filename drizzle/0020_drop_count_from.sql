-- Contract: nothing reads `count_from_month` any more (balances start from the
-- opening balance over every entry; "A pagar" looks a fixed 12 months back).
ALTER TABLE "user_settings" DROP CONSTRAINT "user_settings_count_from_first_day";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "count_from_month";
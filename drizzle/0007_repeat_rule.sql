CREATE TYPE "public"."month_by" AS ENUM('day', 'weekday', 'last_weekday');--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "repeat_every" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "month_by" "month_by" DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_repeat_every_valid" CHECK ("entries"."repeat_every" between 1 and 99 and ("entries"."repeat_every" = 1 or "entries"."recurrence" in ('monthly', 'yearly')));--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_month_by_monthly_only" CHECK ("entries"."month_by" = 'day' or "entries"."recurrence" = 'monthly');
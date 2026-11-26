-- Espaços: fully separated ledgers per user (Pessoal × Empresa). Every
-- financial row gains `space_id`; composite FKs move from `(id, user_id)` to
-- `(id, space_id)`, and `(space_id, user_id)` → spaces keeps every row's space
-- inside its user. Expand + backfill + contract in one transaction: every
-- existing row goes to its user's (new) personal space, so nothing changes for
-- current data. Hand-ordered from the drizzle-kit output (backfill before NOT
-- NULL; old FKs dropped before the uniques/PKs they point at).
CREATE TYPE "public"."space_kind" AS ENUM('personal', 'business');--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "space_kind" NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spaces_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "spaces_name_length" CHECK (char_length("spaces"."name") between 1 and 40),
	CONSTRAINT "spaces_personal_active" CHECK ("spaces"."kind" <> 'personal' or "spaces"."archived_at" is null)
);
--> statement-breakpoint
ALTER TABLE "spaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "spaces_one_personal_idx" ON "spaces" USING btree ("user_id") WHERE "spaces"."kind" = 'personal';--> statement-breakpoint
CREATE TABLE "bank_feed_items" (
	"user_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"space_id" uuid,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_feed_items_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "bank_feed_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bank_feed_items" ADD CONSTRAINT "bank_feed_items_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_feed_items" ADD CONSTRAINT "bank_feed_items_space_fk" FOREIGN KEY ("space_id","user_id") REFERENCES "public"."spaces"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Backfill: one personal space per existing user.
INSERT INTO "spaces" ("user_id", "name", "kind") SELECT "id", 'Pessoal', 'personal' FROM "profiles";--> statement-breakpoint

-- Undo records are ephemeral (minutes); start clean instead of mapping them.
DELETE FROM "undo_snapshots";--> statement-breakpoint

-- Expand: nullable space_id, backfilled with the owner's personal space.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'banks', 'accounts', 'pots', 'budget_plans', 'budget_plan_targets', 'categories',
    'entries', 'entry_parts', 'entry_overrides', 'occurrence_payments', 'user_settings',
    'undo_snapshots', 'import_links', 'import_raw', 'bank_feed_accounts', 'bank_transactions'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN space_id uuid', t);
    EXECUTE format(
      'UPDATE public.%I x SET space_id = s.id FROM public.spaces s WHERE s.user_id = x.user_id AND s.kind = %L',
      t, 'personal');
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN space_id SET NOT NULL', t);
  END LOOP;
END
$$;--> statement-breakpoint

-- Existing bank connections stay where their data already is: the personal space.
INSERT INTO "bank_feed_items" ("user_id", "item_id", "space_id")
SELECT DISTINCT a."user_id", a."item_id", a."space_id" FROM "bank_feed_accounts" a
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Contract: drop the user-scoped FKs, uniques, PKs and indexes...
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_bank_fk";--> statement-breakpoint
ALTER TABLE "bank_feed_accounts" DROP CONSTRAINT "bank_feed_accounts_account_fk";--> statement-breakpoint
ALTER TABLE "bank_transactions" DROP CONSTRAINT "bank_transactions_feed_account_fk";--> statement-breakpoint
ALTER TABLE "budget_plan_targets" DROP CONSTRAINT "budget_plan_targets_plan_fk";--> statement-breakpoint
ALTER TABLE "budget_plan_targets" DROP CONSTRAINT "budget_plan_targets_pot_fk";--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_default_pot_fk";--> statement-breakpoint
ALTER TABLE "entries" DROP CONSTRAINT "entries_account_fk";--> statement-breakpoint
ALTER TABLE "entries" DROP CONSTRAINT "entries_to_account_fk";--> statement-breakpoint
ALTER TABLE "entries" DROP CONSTRAINT "entries_category_fk";--> statement-breakpoint
ALTER TABLE "entries" DROP CONSTRAINT "entries_pot_fk";--> statement-breakpoint
ALTER TABLE "entry_overrides" DROP CONSTRAINT "entry_overrides_entry_fk";--> statement-breakpoint
ALTER TABLE "entry_parts" DROP CONSTRAINT "entry_parts_entry_fk";--> statement-breakpoint
ALTER TABLE "import_links" DROP CONSTRAINT "import_links_entry_fk";--> statement-breakpoint
ALTER TABLE "occurrence_payments" DROP CONSTRAINT "occurrence_payments_entry_fk";--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_id_user_id_unique";--> statement-breakpoint
ALTER TABLE "bank_feed_accounts" DROP CONSTRAINT "bank_feed_accounts_id_user_id_unique";--> statement-breakpoint
ALTER TABLE "bank_feed_accounts" DROP CONSTRAINT "bank_feed_accounts_external_unique";--> statement-breakpoint
ALTER TABLE "banks" DROP CONSTRAINT "banks_id_user_id_unique";--> statement-breakpoint
ALTER TABLE "budget_plans" DROP CONSTRAINT "budget_plans_id_user_id_unique";--> statement-breakpoint
ALTER TABLE "budget_plans" DROP CONSTRAINT "budget_plans_user_starts_unique";--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_id_user_id_unique";--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_user_group_name_unique";--> statement-breakpoint
ALTER TABLE "entries" DROP CONSTRAINT "entries_id_user_id_unique";--> statement-breakpoint
ALTER TABLE "pots" DROP CONSTRAINT "pots_pk";--> statement-breakpoint
ALTER TABLE "undo_snapshots" DROP CONSTRAINT "undo_snapshots_pkey";--> statement-breakpoint
ALTER TABLE "user_settings" DROP CONSTRAINT "user_settings_pkey";--> statement-breakpoint
DROP INDEX "accounts_user_id_idx";--> statement-breakpoint
DROP INDEX "banks_user_id_sort_idx";--> statement-breakpoint
DROP INDEX "entries_user_id_start_month_idx";--> statement-breakpoint
DROP INDEX "entry_overrides_user_id_month_idx";--> statement-breakpoint
DROP INDEX "entry_parts_user_id_idx";--> statement-breakpoint
DROP INDEX "occurrence_payments_user_id_month_idx";--> statement-breakpoint
DROP INDEX "entries_pot_idx";--> statement-breakpoint

-- ...and add the space-scoped ones: PKs/uniques first (FK targets), then FKs.
ALTER TABLE "pots" ADD CONSTRAINT "pots_pk" PRIMARY KEY("space_id","key");--> statement-breakpoint
ALTER TABLE "undo_snapshots" ADD CONSTRAINT "undo_snapshots_pkey" PRIMARY KEY("space_id");--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY("space_id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_id_space_id_unique" UNIQUE("id","space_id");--> statement-breakpoint
ALTER TABLE "bank_feed_accounts" ADD CONSTRAINT "bank_feed_accounts_id_space_id_unique" UNIQUE("id","space_id");--> statement-breakpoint
ALTER TABLE "bank_feed_accounts" ADD CONSTRAINT "bank_feed_accounts_external_unique" UNIQUE("space_id","source","external_id");--> statement-breakpoint
ALTER TABLE "banks" ADD CONSTRAINT "banks_id_space_id_unique" UNIQUE("id","space_id");--> statement-breakpoint
ALTER TABLE "budget_plans" ADD CONSTRAINT "budget_plans_id_space_id_unique" UNIQUE("id","space_id");--> statement-breakpoint
ALTER TABLE "budget_plans" ADD CONSTRAINT "budget_plans_space_starts_unique" UNIQUE("space_id","starts_month");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_id_space_id_unique" UNIQUE("id","space_id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_space_group_name_unique" UNIQUE("space_id","group_name","name");--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_id_space_id_unique" UNIQUE("id","space_id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_space_fk" FOREIGN KEY ("space_id","user_id") REFERENCES "public"."spaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_bank_fk" FOREIGN KEY ("bank_id","space_id") REFERENCES "public"."banks"("id","space_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_feed_accounts" ADD CONSTRAINT "bank_feed_accounts_space_fk" FOREIGN KEY ("space_id","user_id") REFERENCES "public"."spaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Deleting the fluxi account only unmaps the feed (nulls account_id alone; space_id is NOT NULL).
ALTER TABLE "bank_feed_accounts" ADD CONSTRAINT "bank_feed_accounts_account_fk" FOREIGN KEY ("account_id","space_id") REFERENCES "public"."accounts"("id","space_id") ON DELETE set null ("account_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_space_fk" FOREIGN KEY ("space_id","user_id") REFERENCES "public"."spaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_feed_account_fk" FOREIGN KEY ("feed_account_id","space_id") REFERENCES "public"."bank_feed_accounts"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banks" ADD CONSTRAINT "banks_space_fk" FOREIGN KEY ("space_id","user_id") REFERENCES "public"."spaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_plan_targets" ADD CONSTRAINT "budget_plan_targets_space_fk" FOREIGN KEY ("space_id","user_id") REFERENCES "public"."spaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_plan_targets" ADD CONSTRAINT "budget_plan_targets_plan_fk" FOREIGN KEY ("plan_id","space_id") REFERENCES "public"."budget_plans"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_plan_targets" ADD CONSTRAINT "budget_plan_targets_pot_fk" FOREIGN KEY ("pot_key","space_id") REFERENCES "public"."pots"("key","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_plans" ADD CONSTRAINT "budget_plans_space_fk" FOREIGN KEY ("space_id","user_id") REFERENCES "public"."spaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_space_fk" FOREIGN KEY ("space_id","user_id") REFERENCES "public"."spaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_default_pot_fk" FOREIGN KEY ("default_pot","space_id") REFERENCES "public"."pots"("key","space_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_space_fk" FOREIGN KEY ("space_id","user_id") REFERENCES "public"."spaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_account_fk" FOREIGN KEY ("account_id","space_id") REFERENCES "public"."accounts"("id","space_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_to_account_fk" FOREIGN KEY ("to_account_id","space_id") REFERENCES "public"."accounts"("id","space_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_category_fk" FOREIGN KEY ("category_id","space_id") REFERENCES "public"."categories"("id","space_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_pot_fk" FOREIGN KEY ("pot","space_id") REFERENCES "public"."pots"("key","space_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_overrides" ADD CONSTRAINT "entry_overrides_space_fk" FOREIGN KEY ("space_id","user_id") REFERENCES "public"."spaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_overrides" ADD CONSTRAINT "entry_overrides_entry_fk" FOREIGN KEY ("entry_id","space_id") REFERENCES "public"."entries"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_parts" ADD CONSTRAINT "entry_parts_space_fk" FOREIGN KEY ("space_id","user_id") REFERENCES "public"."spaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_parts" ADD CONSTRAINT "entry_parts_entry_fk" FOREIGN KEY ("entry_id","space_id") REFERENCES "public"."entries"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_links" ADD CONSTRAINT "import_links_space_fk" FOREIGN KEY ("space_id","user_id") REFERENCES "public"."spaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_links" ADD CONSTRAINT "import_links_entry_fk" FOREIGN KEY ("entry_id","space_id") REFERENCES "public"."entries"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_raw" ADD CONSTRAINT "import_raw_space_fk" FOREIGN KEY ("space_id","user_id") REFERENCES "public"."spaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_payments" ADD CONSTRAINT "occurrence_payments_space_fk" FOREIGN KEY ("space_id","user_id") REFERENCES "public"."spaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_payments" ADD CONSTRAINT "occurrence_payments_entry_fk" FOREIGN KEY ("entry_id","space_id") REFERENCES "public"."entries"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pots" ADD CONSTRAINT "pots_space_fk" FOREIGN KEY ("space_id","user_id") REFERENCES "public"."spaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "undo_snapshots" ADD CONSTRAINT "undo_snapshots_space_fk" FOREIGN KEY ("space_id","user_id") REFERENCES "public"."spaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_space_fk" FOREIGN KEY ("space_id","user_id") REFERENCES "public"."spaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_space_id_idx" ON "accounts" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "banks_space_id_sort_idx" ON "banks" USING btree ("space_id","sort");--> statement-breakpoint
CREATE INDEX "entries_space_id_start_month_idx" ON "entries" USING btree ("space_id","start_month");--> statement-breakpoint
CREATE INDEX "entry_overrides_space_id_month_idx" ON "entry_overrides" USING btree ("space_id","month");--> statement-breakpoint
CREATE INDEX "entry_parts_space_id_idx" ON "entry_parts" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "occurrence_payments_space_id_month_idx" ON "occurrence_payments" USING btree ("space_id","month");--> statement-breakpoint
CREATE INDEX "entries_pot_idx" ON "entries" USING btree ("space_id","pot");

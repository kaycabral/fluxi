CREATE TYPE "public"."account_type" AS ENUM('checking', 'credit', 'benefit', 'investment', 'loan');--> statement-breakpoint
CREATE TYPE "public"."entry_kind" AS ENUM('income', 'expense', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."pot_key" AS ENUM('essential', 'comfort', 'guilt_free', 'education', 'variable', 'investment');--> statement-breakpoint
CREATE TYPE "public"."recurrence" AS ENUM('none', 'monthly', 'yearly', 'installments');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bank_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"opening_balance_cents" bigint DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_id_user_id_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "banks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "banks_id_user_id_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "banks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "budget_pots" (
	"user_id" uuid NOT NULL,
	"key" "pot_key" NOT NULL,
	"target_bps" integer NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_pots_pk" PRIMARY KEY("user_id","key"),
	CONSTRAINT "budget_pots_target_bps_range" CHECK ("budget_pots"."target_bps" between 0 and 10000)
);
--> statement-breakpoint
ALTER TABLE "budget_pots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"group_name" text NOT NULL,
	"name" text NOT NULL,
	"default_pot" "pot_key",
	"sort" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "categories_user_group_name_unique" UNIQUE("user_id","group_name","name")
);
--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "entry_kind" NOT NULL,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"account_id" uuid NOT NULL,
	"to_account_id" uuid,
	"category_id" uuid,
	"pot" "pot_key",
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"start_month" date NOT NULL,
	"day" smallint NOT NULL,
	"recurrence" "recurrence" NOT NULL,
	"installments" integer,
	"end_month" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "entries_amount_positive" CHECK ("entries"."amount_cents" > 0),
	CONSTRAINT "entries_day_range" CHECK ("entries"."day" between 1 and 31),
	CONSTRAINT "entries_start_month_first_day" CHECK (extract(day from "entries"."start_month") = 1),
	CONSTRAINT "entries_end_month_valid" CHECK ("entries"."end_month" is null or (extract(day from "entries"."end_month") = 1 and "entries"."end_month" >= "entries"."start_month" and "entries"."recurrence" in ('monthly', 'yearly'))),
	CONSTRAINT "entries_installments_valid" CHECK (("entries"."recurrence" = 'installments') = ("entries"."installments" is not null) and ("entries"."installments" is null or "entries"."installments" >= 1)),
	CONSTRAINT "entries_transfer_fields" CHECK (case when "entries"."kind" = 'transfer'
        then "entries"."to_account_id" is not null and "entries"."to_account_id" <> "entries"."account_id" and "entries"."category_id" is null and "entries"."pot" is null
        else "entries"."to_account_id" is null end),
	CONSTRAINT "entries_pot_expense_only" CHECK ("entries"."pot" is null or "entries"."kind" = 'expense')
);
--> statement-breakpoint
ALTER TABLE "entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "entry_overrides" (
	"entry_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"month" date NOT NULL,
	"amount_cents" bigint,
	"day" smallint,
	"skipped" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entry_overrides_pk" PRIMARY KEY("entry_id","month"),
	CONSTRAINT "entry_overrides_month_first_day" CHECK (extract(day from "entry_overrides"."month") = 1),
	CONSTRAINT "entry_overrides_amount_positive" CHECK ("entry_overrides"."amount_cents" is null or "entry_overrides"."amount_cents" > 0),
	CONSTRAINT "entry_overrides_day_range" CHECK ("entry_overrides"."day" is null or "entry_overrides"."day" between 1 and 31)
);
--> statement-breakpoint
ALTER TABLE "entry_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "entry_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"bps" integer NOT NULL,
	"day" smallint NOT NULL,
	"next_month" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entry_parts_bps_range" CHECK ("entry_parts"."bps" between 1 and 10000),
	CONSTRAINT "entry_parts_day_range" CHECK ("entry_parts"."day" between 1 and 31)
);
--> statement-breakpoint
ALTER TABLE "entry_parts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "import_links" (
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"entry_id" uuid NOT NULL,
	"month" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_links_pk" PRIMARY KEY("user_id","source","external_id"),
	CONSTRAINT "import_links_month_first_day" CHECK ("import_links"."month" is null or extract(day from "import_links"."month") = 1)
);
--> statement-breakpoint
ALTER TABLE "import_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"count_from_month" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_count_from_first_day" CHECK ("user_settings"."count_from_month" is null or extract(day from "user_settings"."count_from_month") = 1)
);
--> statement-breakpoint
ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_bank_fk" FOREIGN KEY ("bank_id","user_id") REFERENCES "public"."banks"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banks" ADD CONSTRAINT "banks_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_pots" ADD CONSTRAINT "budget_pots_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_account_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_to_account_fk" FOREIGN KEY ("to_account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_category_fk" FOREIGN KEY ("category_id","user_id") REFERENCES "public"."categories"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_overrides" ADD CONSTRAINT "entry_overrides_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_overrides" ADD CONSTRAINT "entry_overrides_entry_fk" FOREIGN KEY ("entry_id","user_id") REFERENCES "public"."entries"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_parts" ADD CONSTRAINT "entry_parts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_parts" ADD CONSTRAINT "entry_parts_entry_fk" FOREIGN KEY ("entry_id","user_id") REFERENCES "public"."entries"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_links" ADD CONSTRAINT "import_links_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_links" ADD CONSTRAINT "import_links_entry_fk" FOREIGN KEY ("entry_id","user_id") REFERENCES "public"."entries"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "accounts_bank_id_idx" ON "accounts" USING btree ("bank_id");--> statement-breakpoint
CREATE INDEX "banks_user_id_sort_idx" ON "banks" USING btree ("user_id","sort");--> statement-breakpoint
CREATE INDEX "entries_user_id_start_month_idx" ON "entries" USING btree ("user_id","start_month");--> statement-breakpoint
CREATE INDEX "entries_account_id_idx" ON "entries" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "entries_to_account_id_idx" ON "entries" USING btree ("to_account_id");--> statement-breakpoint
CREATE INDEX "entries_category_id_idx" ON "entries" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "entry_overrides_user_id_month_idx" ON "entry_overrides" USING btree ("user_id","month");--> statement-breakpoint
CREATE INDEX "entry_parts_entry_id_sort_idx" ON "entry_parts" USING btree ("entry_id","sort");--> statement-breakpoint
CREATE INDEX "entry_parts_user_id_idx" ON "entry_parts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "import_links_entry_id_idx" ON "import_links" USING btree ("entry_id");
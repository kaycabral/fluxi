CREATE TABLE "bank_feed_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"item_id" text NOT NULL,
	"institution" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"subtype" text NOT NULL,
	"balance_cents" bigint NOT NULL,
	"account_id" uuid,
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_feed_accounts_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "bank_feed_accounts_external_unique" UNIQUE("user_id","source","external_id")
);
--> statement-breakpoint
ALTER TABLE "bank_feed_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"feed_account_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"date" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"description" text NOT NULL,
	"status" text NOT NULL,
	"category" text,
	"installment_number" smallint,
	"total_installments" smallint,
	"bill_month" date,
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_transactions_external_unique" UNIQUE("user_id","feed_account_id","external_id"),
	CONSTRAINT "bank_transactions_status" CHECK ("bank_transactions"."status" in ('POSTED', 'PENDING')),
	CONSTRAINT "bank_transactions_bill_month_first_day" CHECK ("bank_transactions"."bill_month" is null or extract(day from "bank_transactions"."bill_month") = 1)
);
--> statement-breakpoint
ALTER TABLE "bank_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bank_feed_accounts" ADD CONSTRAINT "bank_feed_accounts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_feed_accounts" ADD CONSTRAINT "bank_feed_accounts_account_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE set null ("account_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_feed_account_fk" FOREIGN KEY ("feed_account_id","user_id") REFERENCES "public"."bank_feed_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_feed_accounts_account_id_idx" ON "bank_feed_accounts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "bank_transactions_feed_account_date_idx" ON "bank_transactions" USING btree ("feed_account_id","date");
CREATE TABLE "categorization_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"pattern" text NOT NULL,
	"min_cents" bigint NOT NULL,
	"max_cents" bigint NOT NULL,
	"category_id" uuid,
	"pot" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorization_rules_pattern" CHECK (char_length("categorization_rules"."pattern") between 1 and 200),
	CONSTRAINT "categorization_rules_range" CHECK ("categorization_rules"."min_cents" >= 0 and "categorization_rules"."max_cents" >= "categorization_rules"."min_cents"),
	CONSTRAINT "categorization_rules_target" CHECK ("categorization_rules"."category_id" is not null or "categorization_rules"."pot" is not null)
);
--> statement-breakpoint
ALTER TABLE "categorization_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bank_feed_accounts" ADD COLUMN "number_hint" text;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_space_fk" FOREIGN KEY ("space_id","user_id") REFERENCES "public"."spaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_category_fk" FOREIGN KEY ("category_id","space_id") REFERENCES "public"."categories"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_pot_fk" FOREIGN KEY ("pot","space_id") REFERENCES "public"."pots"("key","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categorization_rules_space_pattern_idx" ON "categorization_rules" USING btree ("space_id","pattern");--> statement-breakpoint
ALTER TABLE "bank_feed_accounts" ADD CONSTRAINT "bank_feed_accounts_number_hint" CHECK ("bank_feed_accounts"."number_hint" is null or "bank_feed_accounts"."number_hint" ~ '^[0-9]{4}$');
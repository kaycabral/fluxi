ALTER TABLE "entry_parts" ADD CONSTRAINT "entry_parts_id_entry_id_unique" UNIQUE("id","entry_id");--> statement-breakpoint
CREATE TABLE "occurrence_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"month" date NOT NULL,
	"part_id" uuid,
	"paid_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occurrence_payments_occurrence_unique" UNIQUE NULLS NOT DISTINCT("entry_id","month","part_id"),
	CONSTRAINT "occurrence_payments_month_first_day" CHECK (extract(day from "occurrence_payments"."month") = 1)
);
--> statement-breakpoint
ALTER TABLE "occurrence_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "occurrence_payments" ADD CONSTRAINT "occurrence_payments_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_payments" ADD CONSTRAINT "occurrence_payments_entry_fk" FOREIGN KEY ("entry_id","user_id") REFERENCES "public"."entries"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_payments" ADD CONSTRAINT "occurrence_payments_part_fk" FOREIGN KEY ("part_id","entry_id") REFERENCES "public"."entry_parts"("id","entry_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "occurrence_payments_user_id_month_idx" ON "occurrence_payments" USING btree ("user_id","month");--> statement-breakpoint
CREATE INDEX "occurrence_payments_part_id_idx" ON "occurrence_payments" USING btree ("part_id");
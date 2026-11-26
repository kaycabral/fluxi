-- Bank feed → ledger: link table (see src/db/schema-bank-feed.ts), the
-- operation type signal, the undo copy of the links. Each FK nulls only its
-- own column (the space must stay).
CREATE TABLE "bank_entry_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"bank_transaction_id" uuid,
	"entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_entry_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "undo_snapshots" ADD COLUMN "bank_entry_links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "operation_type" text;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_id_space_id_unique" UNIQUE("id","space_id");--> statement-breakpoint
ALTER TABLE "bank_entry_links" ADD CONSTRAINT "bank_entry_links_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_entry_links" ADD CONSTRAINT "bank_entry_links_space_fk" FOREIGN KEY ("space_id","user_id") REFERENCES "public"."spaces"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_entry_links" ADD CONSTRAINT "bank_entry_links_transaction_fk" FOREIGN KEY ("bank_transaction_id","space_id") REFERENCES "public"."bank_transactions"("id","space_id") ON DELETE set null ("bank_transaction_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_entry_links" ADD CONSTRAINT "bank_entry_links_entry_fk" FOREIGN KEY ("entry_id","space_id") REFERENCES "public"."entries"("id","space_id") ON DELETE set null ("entry_id") ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_entry_links_transaction_idx" ON "bank_entry_links" USING btree ("bank_transaction_id");--> statement-breakpoint
CREATE INDEX "bank_entry_links_entry_id_idx" ON "bank_entry_links" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "bank_entry_links_space_id_idx" ON "bank_entry_links" USING btree ("space_id");
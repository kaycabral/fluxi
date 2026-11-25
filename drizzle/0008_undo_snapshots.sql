CREATE TABLE "undo_snapshots" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"token" uuid NOT NULL,
	"entry_ids" uuid[] NOT NULL,
	"entries" jsonb NOT NULL,
	"entry_parts" jsonb NOT NULL,
	"entry_overrides" jsonb NOT NULL,
	"occurrence_payments" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "undo_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "undo_snapshots" ADD CONSTRAINT "undo_snapshots_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
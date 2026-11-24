CREATE TABLE "import_raw" (
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"external_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"target_id" uuid,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_raw_pk" PRIMARY KEY("user_id","source","kind","external_id")
);
--> statement-breakpoint
ALTER TABLE "import_raw" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "import_raw" ADD CONSTRAINT "import_raw_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
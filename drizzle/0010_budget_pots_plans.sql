CREATE TABLE "budget_plan_targets" (
	"plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"pot_key" text NOT NULL,
	"target_bps" integer NOT NULL,
	CONSTRAINT "budget_plan_targets_pk" PRIMARY KEY("plan_id","pot_key"),
	CONSTRAINT "budget_plan_targets_bps_range" CHECK ("budget_plan_targets"."target_bps" between 0 and 10000)
);
--> statement-breakpoint
ALTER TABLE "budget_plan_targets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "budget_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"starts_month" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_plans_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "budget_plans_user_starts_unique" UNIQUE("user_id","starts_month"),
	CONSTRAINT "budget_plans_starts_first_day" CHECK (extract(day from "budget_plans"."starts_month") = 1)
);
--> statement-breakpoint
ALTER TABLE "budget_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pots" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"goal" text DEFAULT 'limit' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pots_pk" PRIMARY KEY("user_id","key"),
	CONSTRAINT "pots_key_format" CHECK ("pots"."key" ~ '^[a-z0-9_]{1,40}$'),
	CONSTRAINT "pots_name_length" CHECK (char_length("pots"."name") between 1 and 40),
	CONSTRAINT "pots_goal_valid" CHECK ("pots"."goal" in ('limit', 'minimum'))
);
--> statement-breakpoint
ALTER TABLE "pots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "default_pot" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "entries" ALTER COLUMN "pot" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "budget_plan_targets" ADD CONSTRAINT "budget_plan_targets_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_plan_targets" ADD CONSTRAINT "budget_plan_targets_plan_fk" FOREIGN KEY ("plan_id","user_id") REFERENCES "public"."budget_plans"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_plan_targets" ADD CONSTRAINT "budget_plan_targets_pot_fk" FOREIGN KEY ("pot_key","user_id") REFERENCES "public"."pots"("key","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_plans" ADD CONSTRAINT "budget_plans_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pots" ADD CONSTRAINT "pots_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Budget defaults for every user: the 6 historic pots (names, colors, goal)
-- and a first plan with the targets of `budget_pots`, starting at the count
-- start (else the current month). Mirrors `DEFAULT_POTS`
-- (src/features/ledger/core/defaults.ts). Idempotent. Runs BEFORE
-- `seed_ledger_defaults`: the seeded categories point at these pots.
CREATE OR REPLACE FUNCTION public.seed_budget_defaults(uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  plan uuid;
BEGIN
  INSERT INTO public.pots (user_id, key, name, color, goal, sort)
  VALUES
    (uid, 'essential', 'Essencial', 'violet', 'limit', 0),
    (uid, 'comfort', 'Conforto', 'orange', 'limit', 1),
    (uid, 'guilt_free', 'Livre', 'pink', 'limit', 2),
    (uid, 'education', 'Educação', 'emerald', 'limit', 3),
    (uid, 'variable', 'Variável', 'yellow', 'limit', 4),
    (uid, 'investment', 'Investimento', 'blue', 'minimum', 5)
  ON CONFLICT DO NOTHING;

  IF EXISTS (SELECT 1 FROM public.budget_plans WHERE user_id = uid) THEN
    RETURN;
  END IF;

  INSERT INTO public.budget_plans (user_id, starts_month)
  SELECT uid, COALESCE(
    (SELECT s.count_from_month FROM public.user_settings s WHERE s.user_id = uid),
    date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date
  )
  RETURNING id INTO plan;

  -- Existing users keep their targets (`budget_pots`); new ones get the defaults.
  INSERT INTO public.budget_plan_targets (plan_id, user_id, pot_key, target_bps)
  SELECT plan, uid, d.key, COALESCE(bp.target_bps, d.target_bps)
  FROM (
    VALUES
      ('essential', 3300),
      ('comfort', 700),
      ('guilt_free', 700),
      ('education', 300),
      ('variable', 800),
      ('investment', 3200)
  ) AS d (key, target_bps)
  LEFT JOIN public.budget_pots bp ON bp.user_id = uid AND bp.key::text = d.key
  WHERE COALESCE(bp.target_bps, d.target_bps) > 0;
END;
$$;--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.seed_budget_defaults(uuid) FROM PUBLIC, anon, authenticated;--> statement-breakpoint

-- Same as 0003_ledger_defaults, plus the budget defaults (first: categories need the pots).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture')
  )
  ON CONFLICT (id) DO NOTHING;
  PERFORM public.seed_budget_defaults(NEW.id);
  PERFORM public.seed_ledger_defaults(NEW.id);
  RETURN NEW;
END;
$$;--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;--> statement-breakpoint

SELECT public.seed_budget_defaults(id) FROM public.profiles;--> statement-breakpoint

ALTER TABLE "categories" ADD CONSTRAINT "categories_default_pot_fk" FOREIGN KEY ("default_pot","user_id") REFERENCES "public"."pots"("key","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_pot_fk" FOREIGN KEY ("pot","user_id") REFERENCES "public"."pots"("key","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_pot_idx" ON "entries" USING btree ("user_id","pot");
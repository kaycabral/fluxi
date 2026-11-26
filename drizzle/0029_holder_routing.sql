ALTER TABLE "bank_feed_accounts" ADD COLUMN "holder_type" text;--> statement-breakpoint
ALTER TABLE "bank_feed_accounts" ADD COLUMN "holder_key" text;--> statement-breakpoint
ALTER TABLE "bank_feed_items" ADD COLUMN "space_source" text;--> statement-breakpoint
ALTER TABLE "bank_feed_items" ADD COLUMN "suggested_space_name" text;--> statement-breakpoint
CREATE INDEX "bank_feed_accounts_holder_key_idx" ON "bank_feed_accounts" USING btree ("user_id","holder_key");--> statement-breakpoint
ALTER TABLE "bank_feed_accounts" ADD CONSTRAINT "bank_feed_accounts_holder_type" CHECK ("bank_feed_accounts"."holder_type" is null or "bank_feed_accounts"."holder_type" in ('person', 'company'));--> statement-breakpoint
ALTER TABLE "bank_feed_accounts" ADD CONSTRAINT "bank_feed_accounts_holder_key" CHECK ("bank_feed_accounts"."holder_key" is null or ("bank_feed_accounts"."holder_type" = 'company' and "bank_feed_accounts"."holder_key" ~ '^[0-9a-f]{64}$'));--> statement-breakpoint
-- Every space chosen before the routing was the user's; so was pausing a
-- connection that had already synced (its feed accounts are still stored).
UPDATE "bank_feed_items" i SET "space_source" = 'manual'
WHERE i."space_id" IS NOT NULL
  OR EXISTS (SELECT 1 FROM "bank_feed_accounts" fa WHERE fa."user_id" = i."user_id" AND fa."item_id" = i."item_id");--> statement-breakpoint
ALTER TABLE "bank_feed_items" ADD CONSTRAINT "bank_feed_items_space_source" CHECK ("bank_feed_items"."space_source" is null or "bank_feed_items"."space_source" in ('auto', 'manual'));--> statement-breakpoint
ALTER TABLE "bank_feed_items" ADD CONSTRAINT "bank_feed_items_routed" CHECK ("bank_feed_items"."space_id" is null or "bank_feed_items"."space_source" is not null);--> statement-breakpoint
ALTER TABLE "bank_feed_items" ADD CONSTRAINT "bank_feed_items_suggestion" CHECK ("bank_feed_items"."suggested_space_name" is null or ("bank_feed_items"."space_id" is null and char_length("bank_feed_items"."suggested_space_name") between 1 and 40));;--> statement-breakpoint

-- Holder-aware names: a connection whose accounts a company holds is named
-- "<institution> Empresas" (unless the name already says "Empresas"), and a
-- derived "<base> Empresas" also goes by its base's aliases. Mirrors
-- `withHolderSuffix` / `aliasesOf` in `src/features/bank-feed/core/institution.ts`
-- (the Postgres suite checks they agree on `INSTITUTION_SAMPLES`).

CREATE OR REPLACE FUNCTION private.feed_institution_aliases(p_institution text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH base AS (
    SELECT pg_catalog.left(p_institution, pg_catalog.length(p_institution) - 9) AS name
    WHERE p_institution LIKE '% Empresas'
      AND NOT EXISTS (SELECT 1 FROM private.feed_institution_rules() r WHERE r.name = p_institution)
  )
  SELECT pg_catalog.array_agg(DISTINCT a.alias)
  FROM (
    SELECT r.alias FROM private.feed_institution_rules() r WHERE r.name = p_institution
    UNION ALL
    SELECT private.feed_normalize(p_institution)
    UNION ALL
    SELECT r.alias FROM private.feed_institution_rules() r JOIN base ON r.name = base.name
    UNION ALL
    SELECT private.feed_normalize(base.name) FROM base
  ) a
$$;--> statement-breakpoint

-- `institutionOf(names, holderTypes)`.
CREATE OR REPLACE FUNCTION private.feed_holder_institution(p_names text[], p_holder_types text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN 'company' = ANY (coalesce(p_holder_types, '{}'::text[]))
      AND private.feed_normalize(x.name) !~ '(^|[^a-z0-9])empresas([^a-z0-9]|$)'
    THEN x.name || ' Empresas'
    ELSE x.name END
  FROM (SELECT private.feed_institution(p_names) AS name) x
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.auto_link_bank_feed(p_user uuid, p_space uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_linked integer := 0;
  v_institution text;
  v_aliases text[];
  v_type public.account_type;
  v_account uuid;
  v_bank uuid;
  v_count integer;
  i record;
  f record;
BEGIN
  FOR i IN
    SELECT fa.item_id,
      pg_catalog.array_agg(fa.name ORDER BY fa.type, fa.name, fa.id) AS names,
      pg_catalog.array_agg(fa.holder_type ORDER BY fa.type, fa.name, fa.id) AS holders
    FROM public.bank_feed_accounts fa
    WHERE fa.user_id = p_user AND fa.space_id = p_space
    GROUP BY fa.item_id
    ORDER BY fa.item_id
  LOOP
    v_institution := private.feed_holder_institution(i.names, i.holders);
    v_aliases := private.feed_institution_aliases(v_institution);
    FOR f IN
      SELECT fa.id, fa.name, fa.type, fa.subtype
      FROM public.bank_feed_accounts fa
      WHERE fa.user_id = p_user AND fa.space_id = p_space AND fa.item_id = i.item_id
        AND fa.mapping_source IS NULL AND fa.account_id IS NULL
        AND (fa.balance_cents <> 0 OR EXISTS (
          SELECT 1 FROM public.bank_transactions t
          WHERE t.feed_account_id = fa.id AND t.user_id = p_user AND t.space_id = p_space
        ))
      ORDER BY fa.type, fa.name, fa.id
      FOR UPDATE
    LOOP
      v_type := CASE WHEN f.type = 'CREDIT' THEN 'credit' ELSE 'checking' END::public.account_type;
      v_bank := NULL;
      SELECT pg_catalog.count(*), pg_catalog.min(a.id::text)::uuid INTO v_count, v_account
      FROM public.accounts a
      JOIN public.banks b ON b.id = a.bank_id AND b.space_id = a.space_id
      WHERE a.user_id = p_user AND a.space_id = p_space AND a.archived_at IS NULL
        AND b.user_id = p_user AND b.space_id = p_space
        AND a.type = v_type
        AND private.feed_normalize(pg_catalog.btrim(b.name)) = ANY (v_aliases)
        AND NOT EXISTS (
          SELECT 1 FROM public.bank_feed_accounts o
          WHERE o.account_id = a.id AND o.space_id = p_space AND o.id <> f.id
        );
      IF v_count <> 1 THEN
        SELECT b.id INTO v_bank
        FROM public.banks b
        WHERE b.user_id = p_user AND b.space_id = p_space AND b.archived_at IS NULL
          AND private.feed_normalize(pg_catalog.btrim(b.name)) = ANY (v_aliases)
        ORDER BY b.sort, b.created_at, b.id
        LIMIT 1;
        IF v_bank IS NULL THEN
          INSERT INTO public.banks (user_id, space_id, name, sort)
          SELECT p_user, p_space, pg_catalog.left(v_institution, 80),
            coalesce(pg_catalog.max(b.sort), -1) + 1
          FROM public.banks b WHERE b.user_id = p_user AND b.space_id = p_space
          RETURNING id INTO v_bank;
        END IF;
        INSERT INTO public.accounts (user_id, space_id, bank_id, name, type, opening_balance_cents)
        VALUES (p_user, p_space, v_bank,
          pg_catalog.left(private.feed_account_short_label(v_institution, f.name, f.type, f.subtype), 80),
          v_type, 0)
        RETURNING id INTO v_account;
      END IF;
      UPDATE public.bank_feed_accounts fa
      SET account_id = v_account, mapping_source = 'auto', updated_at = now()
      WHERE fa.id = f.id AND fa.user_id = p_user AND fa.space_id = p_space;
      v_linked := v_linked + 1;
    END LOOP;
  END LOOP;
  RETURN v_linked;
END;
$$;--> statement-breakpoint

-- Routing of a connection nobody decided yet (`space_source` null), from its
-- accounts' holders as the sync read them (documents never reach the
-- database: only the kinds and the companies' keyed hashes):
--   * every account held by a person → the user's personal space;
--   * a company whose holder key already feeds an active space of the user
--     (another connection) → that space;
--   * otherwise it stays unassigned; for a company, `p_suggested` is kept as
--     the name offered for a new space.
-- An automatic choice is `auto`; any choice of the user (`manual`, pausing
-- included) is never touched. SECURITY DEFINER so `fluxi_sync` reads no
-- space itself; scoped to `p_user`.
CREATE OR REPLACE FUNCTION private.route_bank_feed_item(
  p_user uuid, p_item text, p_holder_types text[], p_holder_keys text[], p_suggested text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source text;
  v_current uuid;
  v_space uuid;
  v_types text[] := coalesce(p_holder_types, '{}'::text[]);
  v_company boolean;
BEGIN
  IF p_user IS NULL OR p_item IS NULL THEN
    RAISE EXCEPTION 'route_bank_feed_item: missing argument';
  END IF;
  SELECT i.space_source, i.space_id INTO v_source, v_current
  FROM public.bank_feed_items i
  WHERE i.user_id = p_user AND i.item_id = p_item
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'route_bank_feed_item: unknown connection for this user';
  END IF;
  IF v_source IS NOT NULL THEN
    RETURN v_current;
  END IF;
  v_company := 'company' = ANY (v_types);
  IF pg_catalog.cardinality(v_types) > 0
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.unnest(v_types) h WHERE h IS DISTINCT FROM 'person') THEN
    SELECT s.id INTO v_space
    FROM public.spaces s
    WHERE s.user_id = p_user AND s.kind = 'personal' AND s.archived_at IS NULL;
  ELSIF v_company THEN
    SELECT s.id INTO v_space
    FROM public.spaces s
    JOIN public.bank_feed_items o ON o.user_id = p_user AND o.space_id = s.id AND o.item_id <> p_item
    JOIN public.bank_feed_accounts fa
      ON fa.user_id = p_user AND fa.space_id = s.id AND fa.item_id = o.item_id
    WHERE s.user_id = p_user AND s.archived_at IS NULL
      AND fa.holder_key = ANY (coalesce(p_holder_keys, '{}'::text[]))
    GROUP BY s.id
    ORDER BY pg_catalog.count(*) DESC, s.id
    LIMIT 1;
  END IF;
  IF v_space IS NOT NULL THEN
    UPDATE public.bank_feed_items i
    SET space_id = v_space, space_source = 'auto', suggested_space_name = NULL, updated_at = now()
    WHERE i.user_id = p_user AND i.item_id = p_item;
    RETURN v_space;
  END IF;
  UPDATE public.bank_feed_items i
  SET suggested_space_name = CASE WHEN v_company
      THEN NULLIF(pg_catalog.btrim(pg_catalog.left(pg_catalog.btrim(p_suggested), 40)), '')
      ELSE NULL END,
    updated_at = now()
  WHERE i.user_id = p_user AND i.item_id = p_item;
  RETURN NULL;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.feed_institution_aliases(text) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.feed_holder_institution(text[], text[]) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.auto_link_bank_feed(uuid, uuid) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.route_bank_feed_item(uuid, text, text[], text[], text) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.route_bank_feed_item(uuid, text, text[], text[], text) TO fluxi_sync;
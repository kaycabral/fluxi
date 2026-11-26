ALTER TABLE "bank_feed_accounts" ADD COLUMN "mapping_source" text;--> statement-breakpoint
ALTER TABLE "bank_feed_accounts" ADD CONSTRAINT "bank_feed_accounts_mapping_source" CHECK ("bank_feed_accounts"."mapping_source" is null or "bank_feed_accounts"."mapping_source" in ('auto', 'manual'));--> statement-breakpoint
-- Every mapping decided before the auto-link was the user's.
UPDATE "bank_feed_accounts" SET "mapping_source" = 'manual' WHERE "account_id" IS NOT NULL;--> statement-breakpoint

-- Auto-link: before materializing a space, every feed account with movement
-- (transactions or a non-zero balance) that nobody decided yet
-- (`mapping_source` null) is mapped onto a Fluxi account of the space: the
-- only active account of the same type (credit card → credit, else checking)
-- in a bank named like the connection's institution and not mapped by
-- another feed account; none or several → a new account (in the bank of that
-- institution, created when missing). The institution and the names follow
-- `src/features/bank-feed/core/institution.ts` (the Postgres suite checks
-- they agree). A manual choice (`manual`, "Não vincular" included) is never
-- touched. Runs inside `private.materialize_bank_feed` (SECURITY DEFINER), so
-- `fluxi_sync` still has no privilege on banks/accounts.

CREATE OR REPLACE FUNCTION private.feed_normalize(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.translate(pg_catalog.lower(p_value), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
$$;--> statement-breakpoint

-- `p_normalized` starts with the alias as a whole word.
CREATE OR REPLACE FUNCTION private.feed_starts_with_word(p_normalized text, p_alias text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.left(p_normalized, pg_catalog.length(p_alias)) = p_alias
    AND (
      pg_catalog.length(p_normalized) = pg_catalog.length(p_alias)
      OR pg_catalog.substr(p_normalized, pg_catalog.length(p_alias) + 1, 1) !~ '[a-z0-9]'
      OR p_alias !~ '[a-z0-9]$'
    )
$$;--> statement-breakpoint

-- `INSTITUTION_RULES`: rule order, display name, normalized alias.
CREATE OR REPLACE FUNCTION private.feed_institution_rules()
RETURNS TABLE (ord integer, name text, alias text)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  VALUES
    (1, 'BTG Empresas', 'btg empresas'),
    (2, 'BTG Pactual', 'btg pactual'),
    (2, 'BTG Pactual', 'btg banking'),
    (2, 'BTG Pactual', 'btg+'),
    (2, 'BTG Pactual', 'btg'),
    (3, 'Itaú', 'itau unibanco'),
    (3, 'Itaú', 'itau'),
    (4, 'Nubank', 'nu pagamentos'),
    (4, 'Nubank', 'nubank')
$$;--> statement-breakpoint

-- `aliasesOf`: the rule's aliases plus the normalized name itself.
CREATE OR REPLACE FUNCTION private.feed_institution_aliases(p_institution text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.array_agg(DISTINCT a.alias)
  FROM (
    SELECT r.alias FROM private.feed_institution_rules() r WHERE r.name = p_institution
    UNION ALL
    SELECT private.feed_normalize(p_institution)
  ) a
$$;--> statement-breakpoint

-- `institutionOf`.
CREATE OR REPLACE FUNCTION private.feed_institution(p_names text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH names AS (
    SELECT n.name, n.pos FROM pg_catalog.unnest(p_names) WITH ORDINALITY AS n (name, pos)
  ),
  matched AS (
    SELECT (
      SELECT r.ord FROM private.feed_institution_rules() r
      WHERE private.feed_starts_with_word(private.feed_normalize(pg_catalog.btrim(names.name)), r.alias)
      ORDER BY r.ord LIMIT 1
    ) AS ord
    FROM names
  ),
  known AS (
    SELECT m.ord, pg_catalog.count(*) AS hits FROM matched m WHERE m.ord IS NOT NULL GROUP BY m.ord
  ),
  words AS (
    SELECT (pg_catalog.regexp_split_to_array(pg_catalog.btrim(names.name), '\s+'))[1] AS word, names.pos
    FROM names
  ),
  counted AS (
    SELECT w.word, w.pos,
      pg_catalog.count(*) OVER (PARTITION BY private.feed_normalize(w.word)) AS hits
    FROM words w
    WHERE w.word ~ '[[:alnum:]]'
  )
  SELECT coalesce(
    (SELECT r.name FROM known k JOIN private.feed_institution_rules() r ON r.ord = k.ord
     ORDER BY k.hits DESC, k.ord LIMIT 1),
    (SELECT pg_catalog.upper(pg_catalog.left(c.word, 1)) || pg_catalog.lower(pg_catalog.substr(c.word, 2))
     FROM counted c ORDER BY c.hits DESC, c.pos LIMIT 1),
    'Banco'
  )
$$;--> statement-breakpoint

-- `feedAccountShortLabel`: `feedAccountLabel` without "<institution> · " (the
-- name of an account the auto-link creates, shown as "<bank> · <name>").
CREATE OR REPLACE FUNCTION private.feed_account_short_label(
  p_institution text, p_name text, p_type text, p_subtype text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_raw text := pg_catalog.btrim(p_name);
  v_norm text := private.feed_normalize(pg_catalog.btrim(p_name));
  v_alias text;
  v_rest text;
  v_card boolean := p_type = 'CREDIT';
  v_kind text;
BEGIN
  SELECT a INTO v_alias
  FROM pg_catalog.unnest(private.feed_institution_aliases(p_institution)) a
  WHERE private.feed_starts_with_word(v_norm, a)
  ORDER BY pg_catalog.length(a) DESC
  LIMIT 1;
  v_rest := CASE WHEN v_alias IS NULL THEN v_raw
    ELSE pg_catalog.substr(v_raw, pg_catalog.length(v_alias) + 1) END;
  v_rest := pg_catalog.btrim(pg_catalog.regexp_replace(v_rest, '^[[:space:]–·:+|-]+', ''));
  IF v_card AND private.feed_normalize(v_rest) ~ '^cartao([^a-z0-9]|$)' THEN
    v_rest := pg_catalog.btrim(pg_catalog.substr(v_rest, 7));
  END IF;
  v_kind := CASE
    WHEN v_card THEN 'Cartão'
    WHEN p_subtype = 'CHECKING_ACCOUNT' THEN 'Conta corrente'
    WHEN p_subtype = 'SAVINGS_ACCOUNT' THEN 'Poupança'
    ELSE 'Conta' END;
  IF v_rest = '' OR v_rest !~ '[[:alnum:]]' THEN
    RETURN v_kind;
  END IF;
  IF private.feed_normalize(v_rest) ~ '(^|[^a-z0-9])(s\.?a|ltda|instituicao|pagamento)([^a-z0-9]|$)' THEN
    RETURN CASE WHEN v_card THEN 'Cartão' ELSE 'Conta' END;
  END IF;
  RETURN CASE WHEN v_card THEN 'Cartão ' || v_rest ELSE v_rest END;
END;
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
      pg_catalog.array_agg(fa.name ORDER BY fa.type, fa.name, fa.id) AS names
    FROM public.bank_feed_accounts fa
    WHERE fa.user_id = p_user AND fa.space_id = p_space
    GROUP BY fa.item_id
    ORDER BY fa.item_id
  LOOP
    v_institution := private.feed_institution(i.names);
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

-- The materialization of `0021` keeps its body under a new name; the entry
-- point the sync and the app call auto-links first, then materializes.
ALTER FUNCTION private.materialize_bank_feed(uuid, uuid, date) RENAME TO materialize_bank_feed_entries;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.materialize_bank_feed_entries(uuid, uuid, date) FROM PUBLIC, anon, authenticated, fluxi_sync;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.materialize_bank_feed(p_user uuid, p_space uuid, p_today date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_linked integer;
BEGIN
  IF p_user IS NULL OR p_space IS NULL OR p_today IS NULL THEN
    RAISE EXCEPTION 'materialize_bank_feed: missing argument';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = p_space AND s.user_id = p_user) THEN
    RAISE EXCEPTION 'materialize_bank_feed: unknown space for this user';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('materialize_bank_feed:' || p_space::text, 0));
  v_linked := private.auto_link_bank_feed(p_user, p_space);
  RETURN private.materialize_bank_feed_entries(p_user, p_space, p_today)
    || pg_catalog.jsonb_build_object('linked', v_linked);
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.feed_normalize(text) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.feed_starts_with_word(text, text) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.feed_institution_rules() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.feed_institution_aliases(text) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.feed_institution(text[]) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.feed_account_short_label(text, text, text, text) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.auto_link_bank_feed(uuid, uuid) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.materialize_bank_feed(uuid, uuid, date) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.materialize_bank_feed(uuid, uuid, date) TO fluxi_sync;

ALTER TABLE "categorization_rules" ALTER COLUMN "pattern" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD COLUMN "merchant_key" text;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_merchant_key" CHECK (char_length("categorization_rules"."merchant_key") between 1 and 200);--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_one_key" CHECK (("categorization_rules"."pattern" is null) <> ("categorization_rules"."merchant_key" is null));--> statement-breakpoint
-- Bank descriptions are never replaced: the merchant Pluggy identifies is
-- extra information (shown next to the description, used by search, "Aplicar
-- a parecidos" and the categorization rules), and only the user edits a
-- description. Undoes `0025`'s renaming.
--
-- 1. Revert. `0025` renamed a bank entry whose bank text was generic
-- (`private.feed_generic_description`) to the merchant's name. There is no
-- edit history, so the safest available predicate is: the entry's
-- description is exactly the (trimmed) merchant name of its source
-- transaction (a single's only link; a transfer's outgoing side), differs
-- from the bank's text, and that text is one the old rule renamed. A user who
-- typed exactly the merchant's name over a generic text gets the bank's text
-- back (indistinguishable, and harmless: the merchant still shows next to it).
UPDATE public.entries e SET
  description = t.description,
  updated_at = now()
FROM public.bank_entry_links l
JOIN public.bank_transactions t ON t.id = l.bank_transaction_id AND t.space_id = l.space_id
WHERE l.entry_id = e.id AND l.space_id = e.space_id AND l.user_id = e.user_id
  AND e.recurrence = 'none'
  AND (
    (e.kind = 'transfer' AND t.amount_cents < 0)
    OR (e.kind <> 'transfer' AND (
      SELECT count(*) FROM public.bank_entry_links o WHERE o.entry_id = e.id
    ) = 1)
  )
  AND e.description = pg_catalog.btrim(t.merchant_name)
  AND e.description <> t.description
  AND private.feed_generic_description(t.description);--> statement-breakpoint

-- 2. Rules match by merchant or by description. A merchant rule
-- (`merchant_key`) matches bank entries whose merchant name has that
-- `private.description_key`; a description rule (`pattern`) matches by the
-- entry's description. When both kinds match, the merchant rule wins (more
-- specific), then the newest.
CREATE OR REPLACE FUNCTION private.apply_categorization_rules(p_user uuid, p_space uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  WITH target AS (
    SELECT DISTINCT ON (e.id) e.id, e.kind, r.category_id, r.budget_group
    FROM public.entries e
    LEFT JOIN LATERAL (
      SELECT private.description_key(t.merchant_name) AS merchant_key
      FROM public.bank_entry_links l
      JOIN public.bank_transactions t ON t.id = l.bank_transaction_id AND t.space_id = l.space_id
      WHERE l.entry_id = e.id AND l.user_id = p_user AND l.space_id = p_space
        AND pg_catalog.btrim(coalesce(t.merchant_name, '')) <> ''
      ORDER BY t.amount_cents, t.id
      LIMIT 1
    ) m ON true
    JOIN public.categorization_rules r
      ON r.user_id = p_user AND r.space_id = p_space
      AND (r.merchant_key = m.merchant_key OR r.pattern = private.description_key(e.description))
      AND abs(e.amount_cents) BETWEEN r.min_cents AND r.max_cents
    WHERE e.user_id = p_user AND e.space_id = p_space
      AND e.kind <> 'transfer' AND e.recurrence = 'none'
      AND e.category_id IS NULL AND e.budget_group IS NULL
      AND EXISTS (
        SELECT 1 FROM public.bank_entry_links l
        WHERE l.entry_id = e.id AND l.user_id = p_user AND l.space_id = p_space
      )
    ORDER BY e.id, (r.merchant_key IS NOT NULL) DESC, r.created_at DESC, r.id
  )
  UPDATE public.entries e SET
    category_id = t.category_id,
    budget_group = CASE WHEN t.kind = 'expense' THEN t.budget_group END,
    updated_at = now()
  FROM target t
  WHERE e.id = t.id AND e.user_id = p_user AND e.space_id = p_space
    AND (t.category_id IS NOT NULL OR (t.kind = 'expense' AND t.budget_group IS NOT NULL));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
--> statement-breakpoint
-- 3. Materialization creates bank entries with the bank's description and
-- renames nothing (`0026` minus `feed_entry_description` and step 3a).
CREATE OR REPLACE FUNCTION private.materialize_bank_feed_entries(p_user uuid, p_space uuid, p_today date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_stale uuid[];
  v_doomed uuid[];
  v_used uuid[] := '{}';
  v_entry uuid;
  v_removed integer := 0;
  v_transfers integer := 0;
  v_created integer := 0;
  v_updated integer := 0;
  v_count integer;
  v_anchored integer := 0;
  v_split integer := 0;
  v_categorized integer := 0;
  r record;
BEGIN
  IF p_user IS NULL OR p_space IS NULL OR p_today IS NULL THEN
    RAISE EXCEPTION 'materialize_bank_feed: missing argument';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = p_space AND s.user_id = p_user) THEN
    RAISE EXCEPTION 'materialize_bank_feed: unknown space for this user';
  END IF;
  -- One materialization per space at a time.
  PERFORM pg_advisory_xact_lock(hashtextextended('materialize_bank_feed:' || p_space::text, 0));

  -- 1. Removal.
  SELECT
    coalesce(array_agg(l.id), '{}'),
    coalesce(array_agg(DISTINCT l.entry_id) FILTER (WHERE l.entry_id IS NOT NULL), '{}')
  INTO v_stale, v_doomed
  FROM public.bank_entry_links l
  LEFT JOIN public.bank_transactions t ON t.id = l.bank_transaction_id AND t.space_id = l.space_id
  LEFT JOIN public.bank_feed_accounts f ON f.id = t.feed_account_id AND f.space_id = t.space_id
  WHERE l.user_id = p_user
    AND l.space_id = p_space
    AND (t.id IS NULL OR f.account_id IS NULL OR l.entry_id IS NULL);
  -- The other link of a removed transfer goes too: its transaction is
  -- materialized again below (as a single, or paired anew).
  DELETE FROM public.bank_entry_links l
  WHERE l.user_id = p_user
    AND l.space_id = p_space
    AND (l.id = ANY (v_stale) OR l.entry_id = ANY (v_doomed));
  DELETE FROM public.entries e
  WHERE e.user_id = p_user AND e.space_id = p_space AND e.id = ANY (v_doomed);
  v_removed := cardinality(v_doomed);

  -- 1b. Split: a bank transfer whose two transactions no longer qualify
  -- (`private.feed_transfer_pair`) goes back to one single per transaction.
  -- The entry (its id, description, tags, payment) stays with the negative
  -- side as an expense; the positive side's link goes and step 3
  -- materializes it as a new income.
  FOR r IN
    SELECT e.id AS entry_id, li.id AS in_link
    FROM public.entries e
    JOIN public.bank_entry_links lo
      ON lo.entry_id = e.id AND lo.user_id = p_user AND lo.space_id = p_space
    JOIN public.bank_transactions o
      ON o.id = lo.bank_transaction_id AND o.user_id = p_user AND o.space_id = p_space
    JOIN public.bank_entry_links li
      ON li.entry_id = e.id AND li.user_id = p_user AND li.space_id = p_space AND li.id <> lo.id
    JOIN public.bank_transactions i
      ON i.id = li.bank_transaction_id AND i.user_id = p_user AND i.space_id = p_space
    WHERE e.user_id = p_user AND e.space_id = p_space
      AND e.kind = 'transfer'
      AND o.amount_cents < 0 AND i.amount_cents > 0
      AND NOT private.feed_transfer_pair(o.category, o.operation_type, i.category, i.operation_type)
  LOOP
    UPDATE public.entries e SET
      kind = 'expense',
      to_account_id = NULL,
      updated_at = now()
    WHERE e.id = r.entry_id AND e.user_id = p_user AND e.space_id = p_space;
    DELETE FROM public.bank_entry_links l
    WHERE l.id = r.in_link AND l.user_id = p_user AND l.space_id = p_space;
    v_split := v_split + 1;
  END LOOP;

  -- 2. Transfers.
  FOR r IN
    WITH state AS (
      SELECT m.*, l.id AS link_id, l.entry_id, e.kind AS entry_kind
      FROM private.mapped_bank_transactions(p_user, p_space) m
      LEFT JOIN public.bank_entry_links l
        ON l.bank_transaction_id = m.id AND l.user_id = p_user AND l.space_id = p_space
      LEFT JOIN public.entries e
        ON e.id = l.entry_id AND e.user_id = p_user AND e.space_id = p_space
    ),
    free AS (
      -- Not linked yet, or linked to a single (not a transfer).
      SELECT * FROM state
      WHERE link_id IS NULL OR entry_kind <> 'transfer'
    )
    SELECT
      a.id AS out_id, b.id AS in_id,
      coalesce(a.entry_id, b.entry_id) AS entry_id,
      a.account_id AS out_account, b.account_id AS in_account,
      a.amount_cents AS out_amount, a.date AS out_date,
      a.description AS out_description
    FROM free a
    JOIN free b
      ON a.amount_cents < 0
      AND b.amount_cents = -a.amount_cents
      AND a.account_id <> b.account_id
      AND abs(a.date - b.date) <= 3
      AND (a.link_id IS NULL OR b.link_id IS NULL)
      AND private.feed_transfer_pair(a.category, a.operation_type, b.category, b.operation_type)
    ORDER BY
      abs(a.date - b.date),
      a.date,
      a.id,
      b.id
  LOOP
    CONTINUE WHEN r.out_id = ANY (v_used) OR r.in_id = ANY (v_used);
    v_used := v_used || r.out_id || r.in_id;
    v_entry := r.entry_id;
    IF v_entry IS NULL THEN
      INSERT INTO public.entries
        (user_id, space_id, kind, description, amount_cents, account_id, to_account_id,
         start_month, day, recurrence)
      VALUES
        (p_user, p_space, 'transfer', r.out_description, r.out_amount, r.out_account, r.in_account,
         date_trunc('month', r.out_date)::date, extract(day FROM r.out_date)::smallint, 'none')
      RETURNING id INTO v_entry;
    ELSE
      UPDATE public.entries e SET
        kind = 'transfer',
        amount_cents = r.out_amount,
        account_id = r.out_account,
        to_account_id = r.in_account,
        category_id = NULL,
        budget_group = NULL,
        start_month = date_trunc('month', r.out_date)::date,
        day = extract(day FROM r.out_date)::smallint,
        updated_at = now()
      WHERE e.id = v_entry AND e.user_id = p_user AND e.space_id = p_space;
    END IF;
    INSERT INTO public.bank_entry_links (user_id, space_id, bank_transaction_id, entry_id)
    VALUES (p_user, p_space, r.out_id, v_entry), (p_user, p_space, r.in_id, v_entry)
    ON CONFLICT (bank_transaction_id) DO UPDATE SET entry_id = excluded.entry_id, updated_at = now();
    v_transfers := v_transfers + 1;
  END LOOP;

  -- 3. Singles.
  FOR r IN
    SELECT m.*
    FROM private.mapped_bank_transactions(p_user, p_space) m
    WHERE NOT EXISTS (
      SELECT 1 FROM public.bank_entry_links l
      WHERE l.bank_transaction_id = m.id AND l.user_id = p_user AND l.space_id = p_space
    )
    ORDER BY m.date, m.id
  LOOP
    INSERT INTO public.entries
      (user_id, space_id, kind, description, amount_cents, account_id, start_month, day, recurrence)
    VALUES
      (p_user, p_space,
       CASE WHEN r.amount_cents < 0 THEN 'expense' ELSE 'income' END::public.entry_kind,
       r.description, r.amount_cents, r.account_id,
       date_trunc('month', r.date)::date, extract(day FROM r.date)::smallint, 'none')
    RETURNING id INTO v_entry;
    INSERT INTO public.bank_entry_links (user_id, space_id, bank_transaction_id, entry_id)
    VALUES (p_user, p_space, r.id, v_entry);
    v_created := v_created + 1;
  END LOOP;

  -- 3a. Categorization rules, on bank entries still without category and budget group.
  v_categorized := private.apply_categorization_rules(p_user, p_space);

  -- 4. Bank-owned fields: singles, then transfers (source = negative side).
  UPDATE public.entries e SET
    amount_cents = m.amount_cents,
    account_id = m.account_id,
    start_month = date_trunc('month', m.date)::date,
    day = extract(day FROM m.date)::smallint,
    updated_at = now()
  FROM public.bank_entry_links l
  JOIN private.mapped_bank_transactions(p_user, p_space) m ON m.id = l.bank_transaction_id
  WHERE l.user_id = p_user AND l.space_id = p_space
    AND e.id = l.entry_id AND e.user_id = p_user AND e.space_id = p_space
    AND e.kind <> 'transfer' AND e.recurrence = 'none'
    AND (e.amount_cents, e.account_id, e.start_month, e.day)
      IS DISTINCT FROM
      (m.amount_cents, m.account_id, date_trunc('month', m.date)::date, extract(day FROM m.date)::smallint);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_updated := v_count;

  UPDATE public.entries e SET
    amount_cents = o.amount_cents,
    account_id = o.account_id,
    to_account_id = i.account_id,
    start_month = date_trunc('month', o.date)::date,
    day = extract(day FROM o.date)::smallint,
    updated_at = now()
  FROM public.bank_entry_links lo
  JOIN private.mapped_bank_transactions(p_user, p_space) o ON o.id = lo.bank_transaction_id,
       public.bank_entry_links li
  JOIN private.mapped_bank_transactions(p_user, p_space) i ON i.id = li.bank_transaction_id
  WHERE lo.user_id = p_user AND lo.space_id = p_space
    AND li.user_id = p_user AND li.space_id = p_space
    AND lo.entry_id = e.id AND li.entry_id = e.id
    AND o.amount_cents < 0 AND i.amount_cents > 0 AND o.account_id <> i.account_id
    AND e.user_id = p_user AND e.space_id = p_space
    AND e.kind = 'transfer' AND e.recurrence = 'none'
    AND (e.amount_cents, e.account_id, e.to_account_id, e.start_month, e.day)
      IS DISTINCT FROM
      (o.amount_cents, o.account_id, i.account_id, date_trunc('month', o.date)::date,
       extract(day FROM o.date)::smallint);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_updated := v_updated + v_count;

  -- 5. Paid on the date it happened.
  DELETE FROM public.occurrence_payments p
  USING public.entries e
  WHERE p.entry_id = e.id AND p.user_id = p_user AND p.space_id = p_space
    AND e.user_id = p_user AND e.space_id = p_space AND e.recurrence = 'none'
    AND p.month <> e.start_month
    AND EXISTS (
      SELECT 1 FROM public.bank_entry_links l
      WHERE l.entry_id = e.id AND l.user_id = p_user AND l.space_id = p_space
    );
  INSERT INTO public.occurrence_payments (user_id, space_id, entry_id, month, part_id, paid_on)
  SELECT p_user, p_space, e.id, e.start_month, NULL,
    e.start_month + (least(e.day, extract(day FROM (e.start_month + interval '1 month - 1 day'))::integer) - 1)
  FROM public.entries e
  WHERE e.user_id = p_user AND e.space_id = p_space AND e.recurrence = 'none'
    AND EXISTS (
      SELECT 1 FROM public.bank_entry_links l
      WHERE l.entry_id = e.id AND l.user_id = p_user AND l.space_id = p_space
    )
    AND NOT EXISTS (SELECT 1 FROM public.entry_parts pt WHERE pt.entry_id = e.id)
  ON CONFLICT ON CONSTRAINT occurrence_payments_occurrence_unique DO NOTHING;

  -- 6. Anchoring.
  WITH linked AS (
    SELECT DISTINCT l.entry_id
    FROM public.bank_entry_links l
    WHERE l.user_id = p_user AND l.space_id = p_space AND l.entry_id IS NOT NULL
  ),
  occurrence AS (
    SELECT e.kind, e.account_id, e.to_account_id,
      coalesce(o.amount_cents, e.amount_cents) AS amount_cents,
      e.start_month + (least(coalesce(o.day, e.day),
        extract(day FROM (e.start_month + interval '1 month - 1 day'))::integer) - 1) AS on_date
    FROM public.entries e
    JOIN linked ON linked.entry_id = e.id
    LEFT JOIN public.entry_overrides o
      ON o.entry_id = e.id AND o.month = e.start_month AND o.space_id = p_space
    WHERE e.user_id = p_user AND e.space_id = p_space AND e.recurrence = 'none'
      AND NOT coalesce(o.skipped, false)
  ),
  target AS (
    SELECT f.account_id,
      sum(CASE WHEN f.type = 'CREDIT' THEN -f.balance_cents ELSE f.balance_cents END) AS balance_cents
    FROM public.bank_feed_accounts f
    WHERE f.user_id = p_user AND f.space_id = p_space AND f.account_id IS NOT NULL
    GROUP BY f.account_id
  ),
  anchored AS (
    SELECT t.account_id,
      t.balance_cents - coalesce((
        SELECT sum(
          (CASE WHEN oc.account_id = t.account_id THEN oc.amount_cents ELSE 0 END)
          - (CASE WHEN oc.kind = 'transfer' AND oc.to_account_id = t.account_id THEN oc.amount_cents ELSE 0 END))
        FROM occurrence oc
        WHERE oc.on_date <= p_today
      ), 0) AS opening_cents
    FROM target t
  )
  UPDATE public.accounts a SET opening_balance_cents = x.opening_cents, updated_at = now()
  FROM anchored x
  WHERE a.id = x.account_id AND a.user_id = p_user AND a.space_id = p_space
    AND a.opening_balance_cents IS DISTINCT FROM x.opening_cents;
  GET DIAGNOSTICS v_anchored = ROW_COUNT;

  RETURN jsonb_build_object(
    'removed', v_removed,
    'transfers', v_transfers,
    'created', v_created,
    'updated', v_updated,
    'anchored', v_anchored,
    'split', v_split,
    'categorized', v_categorized,
    -- Kept for the deployed sync, which sums it: nothing is renamed any more.
    'named', 0
  );
END;
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.apply_categorization_rules(uuid, uuid) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.materialize_bank_feed_entries(uuid, uuid, date) FROM PUBLIC, anon, authenticated, fluxi_sync;--> statement-breakpoint
DROP FUNCTION private.feed_entry_description(text, text);--> statement-breakpoint
DROP FUNCTION private.feed_generic_description(text);

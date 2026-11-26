-- Bank feed → ledger. `private.materialize_bank_feed(user, space, today)` turns
-- the transactions of the space's MAPPED feed accounts into ledger entries and
-- anchors those accounts' opening balances to the bank-reported balance. The
-- `pluggy-sync` Edge Function (role `fluxi_sync`) calls it after writing each
-- space's feed; `fluxi_sync` gets EXECUTE on it and nothing on the ledger
-- tables. It lives in `private`, a schema PostgREST does not expose.
--
-- SECURITY DEFINER with an empty search_path (every name qualified). It
-- refuses a space that is not the user's and only reads/writes rows of that
-- user AND that space (every statement filters by both; the composite
-- `(…, space_id)` foreign keys make a cross-space row impossible anyway).
--
-- Steps (deterministic, idempotent; a re-run with the same feed changes
-- nothing):
-- 1. Removal: links whose transaction is gone (bank removed it inside the
--    360-day window), whose feed account was unmapped, or without an entry:
--    the entry (if any) and the link are deleted. The user cannot delete a
--    bank entry (the app refuses), so a link without entry is never a choice
--    to keep: its transaction is materialized again.
-- 2. Transfers: opposite amounts on two different mapped accounts within 3
--    days, at least one side not linked yet, Pluggy signals first (card bill
--    payment / same-person transfer category, `PAGAMENTO_FATURA`), then the
--    closest dates, then ids. A pair becomes ONE transfer entry (source = the
--    negative side's account) linked to both transactions; an existing single
--    entry of one side is converted (description kept).
-- 3. Singles: every other unlinked transaction becomes a one-off income
--    (amount > 0) or expense (amount < 0) without category/pot.
-- 4. Bank-owned fields (amount, account, date) are re-synced on linked
--    one-off entries; description, category and pot stay the user's.
-- 5. Every linked one-off entry is marked paid ("Pago", it happened) on its
--    date; payments of other months of it are dropped.
-- 6. Anchoring: each mapped account's opening balance is set so that its
--    balance at the end of `today` (opening + bank-linked one-off entries
--    landing up to today: the projection ignores planned occurrences up to
--    today on connected accounts) equals the bank balance. Credit cards: the
--    feed reports the bill as owed (positive), the ledger holds debt as a
--    negative balance, hence the negation.
CREATE SCHEMA IF NOT EXISTS private;--> statement-breakpoint
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;--> statement-breakpoint
GRANT USAGE ON SCHEMA private TO fluxi_sync;--> statement-breakpoint

-- Transactions of the space's mapped feed accounts, with their fluxi account.
CREATE OR REPLACE FUNCTION private.mapped_bank_transactions(p_user uuid, p_space uuid)
RETURNS TABLE (
  id uuid,
  date date,
  amount_cents bigint,
  description text,
  category text,
  operation_type text,
  account_id uuid
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT t.id, t.date, t.amount_cents, t.description, t.category, t.operation_type, f.account_id
  FROM public.bank_transactions t
  JOIN public.bank_feed_accounts f ON f.id = t.feed_account_id AND f.space_id = t.space_id
  WHERE t.user_id = p_user
    AND t.space_id = p_space
    AND f.user_id = p_user
    AND f.account_id IS NOT NULL
    AND t.amount_cents <> 0
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.mapped_bank_transactions(uuid, uuid) FROM PUBLIC, anon, authenticated;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.materialize_bank_feed(p_user uuid, p_space uuid, p_today date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

  -- 2. Transfers.
  FOR r IN
    WITH state AS (
      SELECT m.*, l.id AS link_id, l.entry_id, e.kind AS entry_kind,
        (m.operation_type = 'PAGAMENTO_FATURA'
          OR m.category IN ('Credit card payment', 'Same person transfer', 'Same person transfer - CASH')) AS signal
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
      a.amount_cents AS out_amount, a.date AS out_date, a.description AS out_description
    FROM free a
    JOIN free b
      ON a.amount_cents < 0
      AND b.amount_cents = -a.amount_cents
      AND a.account_id <> b.account_id
      AND abs(a.date - b.date) <= 3
      AND (a.link_id IS NULL OR b.link_id IS NULL)
    ORDER BY
      CASE WHEN a.signal OR b.signal THEN 0 ELSE 1 END,
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
        pot = NULL,
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
    'anchored', v_anchored
  );
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION private.materialize_bank_feed(uuid, uuid, date) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.materialize_bank_feed(uuid, uuid, date) TO fluxi_sync;

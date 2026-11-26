-- Vocabulary rename: budget "pots" become budget groups and budget "plans"
-- become budget versions (Orçamento → Grupos → Categorias). Pure renames:
-- data, grants and RLS follow the objects, nothing is copied. The functions
-- that name the old objects are replaced below with the new names.
ALTER TABLE public.pots RENAME TO budget_groups;--> statement-breakpoint
ALTER TABLE public.budget_groups RENAME CONSTRAINT pots_pk TO budget_groups_pk;--> statement-breakpoint
ALTER TABLE public.budget_groups RENAME CONSTRAINT pots_space_fk TO budget_groups_space_fk;--> statement-breakpoint
ALTER TABLE public.budget_groups RENAME CONSTRAINT pots_user_id_profiles_id_fk TO budget_groups_user_id_profiles_id_fk;--> statement-breakpoint
ALTER TABLE public.budget_groups RENAME CONSTRAINT pots_key_format TO budget_groups_key_format;--> statement-breakpoint
ALTER TABLE public.budget_groups RENAME CONSTRAINT pots_name_length TO budget_groups_name_length;--> statement-breakpoint
ALTER TABLE public.budget_groups RENAME CONSTRAINT pots_goal_valid TO budget_groups_goal_valid;--> statement-breakpoint
ALTER TABLE public.budget_plans RENAME TO budget_versions;--> statement-breakpoint
ALTER TABLE public.budget_versions RENAME CONSTRAINT budget_plans_pkey TO budget_versions_pkey;--> statement-breakpoint
ALTER TABLE public.budget_versions RENAME CONSTRAINT budget_plans_space_fk TO budget_versions_space_fk;--> statement-breakpoint
ALTER TABLE public.budget_versions RENAME CONSTRAINT budget_plans_user_id_profiles_id_fk TO budget_versions_user_id_profiles_id_fk;--> statement-breakpoint
ALTER TABLE public.budget_versions RENAME CONSTRAINT budget_plans_id_space_id_unique TO budget_versions_id_space_id_unique;--> statement-breakpoint
ALTER TABLE public.budget_versions RENAME CONSTRAINT budget_plans_space_starts_unique TO budget_versions_space_starts_unique;--> statement-breakpoint
ALTER TABLE public.budget_versions RENAME CONSTRAINT budget_plans_starts_first_day TO budget_versions_starts_first_day;--> statement-breakpoint
ALTER TABLE public.budget_plan_targets RENAME TO budget_group_targets;--> statement-breakpoint
ALTER TABLE public.budget_group_targets RENAME COLUMN plan_id TO version_id;--> statement-breakpoint
ALTER TABLE public.budget_group_targets RENAME COLUMN pot_key TO budget_group;--> statement-breakpoint
ALTER TABLE public.budget_group_targets RENAME CONSTRAINT budget_plan_targets_pk TO budget_group_targets_pk;--> statement-breakpoint
ALTER TABLE public.budget_group_targets RENAME CONSTRAINT budget_plan_targets_plan_fk TO budget_group_targets_version_fk;--> statement-breakpoint
ALTER TABLE public.budget_group_targets RENAME CONSTRAINT budget_plan_targets_pot_fk TO budget_group_targets_budget_group_fk;--> statement-breakpoint
ALTER TABLE public.budget_group_targets RENAME CONSTRAINT budget_plan_targets_space_fk TO budget_group_targets_space_fk;--> statement-breakpoint
ALTER TABLE public.budget_group_targets RENAME CONSTRAINT budget_plan_targets_user_id_profiles_id_fk TO budget_group_targets_user_id_profiles_id_fk;--> statement-breakpoint
ALTER TABLE public.budget_group_targets RENAME CONSTRAINT budget_plan_targets_bps_range TO budget_group_targets_bps_range;--> statement-breakpoint
ALTER TABLE public.entries RENAME COLUMN pot TO budget_group;--> statement-breakpoint
ALTER TABLE public.entries RENAME CONSTRAINT entries_pot_fk TO entries_budget_group_fk;--> statement-breakpoint
ALTER TABLE public.entries RENAME CONSTRAINT entries_pot_expense_only TO entries_budget_group_expense_only;--> statement-breakpoint
ALTER INDEX public.entries_pot_idx RENAME TO entries_budget_group_idx;--> statement-breakpoint
-- Undo snapshots hold `entries` rows as jsonb (restored by column name).
UPDATE public.undo_snapshots u SET entries = (
  SELECT jsonb_agg(CASE WHEN e ? 'pot' THEN (e - 'pot') || jsonb_build_object('budget_group', e -> 'pot') ELSE e END)
  FROM jsonb_array_elements(u.entries) e
) WHERE jsonb_array_length(u.entries) > 0;--> statement-breakpoint
ALTER TABLE public.categories RENAME COLUMN default_pot TO default_budget_group;--> statement-breakpoint
ALTER TABLE public.categories RENAME CONSTRAINT categories_default_pot_fk TO categories_default_budget_group_fk;--> statement-breakpoint
ALTER TABLE public.categorization_rules RENAME COLUMN pot TO budget_group;--> statement-breakpoint
ALTER TABLE public.categorization_rules RENAME CONSTRAINT categorization_rules_pot_fk TO categorization_rules_budget_group_fk;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.seed_space_defaults(sid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  uid uuid;
  v_version uuid;
BEGIN
  SELECT s.user_id INTO uid FROM public.spaces s WHERE s.id = sid;
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unknown space %', sid;
  END IF;

  INSERT INTO public.budget_groups (user_id, space_id, key, name, color, goal, sort)
  VALUES
    (uid, sid, 'essential', 'Essencial', 'violet', 'limit', 0),
    (uid, sid, 'comfort', 'Conforto', 'orange', 'limit', 1),
    (uid, sid, 'guilt_free', 'Livre', 'pink', 'limit', 2),
    (uid, sid, 'education', 'Educação', 'emerald', 'limit', 3),
    (uid, sid, 'variable', 'Variável', 'yellow', 'limit', 4),
    (uid, sid, 'investment', 'Investimento', 'blue', 'minimum', 5)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.categories (user_id, space_id, group_name, name, default_budget_group, sort)
  VALUES
    (uid, sid, 'Renda', 'Salário', NULL, 0),
    (uid, sid, 'Renda', 'Décimo terceiro', NULL, 1),
    (uid, sid, 'Renda', 'Férias', NULL, 2),
    (uid, sid, 'Renda', 'Bônus', NULL, 3),
    (uid, sid, 'Renda', 'PPR', NULL, 4),
    (uid, sid, 'Renda', 'Benefícios', NULL, 5),
    (uid, sid, 'Renda', 'Dividendos', NULL, 6),
    (uid, sid, 'Renda', 'Juros recebidos', NULL, 7),
    (uid, sid, 'Renda', 'Reembolso', NULL, 8),
    (uid, sid, 'Renda', 'Outras receitas', NULL, 9),
    (uid, sid, 'Moradia', 'Pagamento de aluguel', 'essential', 10),
    (uid, sid, 'Moradia', 'Condomínio', 'essential', 11),
    (uid, sid, 'Moradia', 'IPTU', 'essential', 12),
    (uid, sid, 'Moradia', 'Manutenção e construção', 'essential', 13),
    (uid, sid, 'Moradia', 'Outros gastos com moradia', 'essential', 14),
    (uid, sid, 'Empréstimos', 'Financiamento de imóvel', 'essential', 15),
    (uid, sid, 'Empréstimos', 'Financiamento de veículo', 'essential', 16),
    (uid, sid, 'Empréstimos', 'Outros empréstimos', 'essential', 17),
    (uid, sid, 'Mercado', 'Supermercado e mercearia', 'essential', 18),
    (uid, sid, 'Mercado', 'Padaria', 'essential', 19),
    (uid, sid, 'Mercado', 'Feira livre', 'essential', 20),
    (uid, sid, 'Mercado', 'Outros gastos com mercado', 'essential', 21),
    (uid, sid, 'Contas', 'Energia elétrica', 'essential', 22),
    (uid, sid, 'Contas', 'Água e esgoto', 'essential', 23),
    (uid, sid, 'Contas', 'Internet', 'essential', 24),
    (uid, sid, 'Contas', 'Celular', 'essential', 25),
    (uid, sid, 'Contas', 'Gás', 'essential', 26),
    (uid, sid, 'Contas', 'Assinatura de serviços', 'essential', 27),
    (uid, sid, 'Contas', 'Outras contas', 'essential', 28),
    (uid, sid, 'Saúde', 'Farmácia', 'essential', 29),
    (uid, sid, 'Saúde', 'Médico', 'essential', 30),
    (uid, sid, 'Saúde', 'Dentista', 'essential', 31),
    (uid, sid, 'Saúde', 'Psicólogo', 'essential', 32),
    (uid, sid, 'Seguros', 'Plano de saúde', 'essential', 33),
    (uid, sid, 'Seguros', 'Seguro de automóvel', 'essential', 34),
    (uid, sid, 'Seguros', 'Seguro de vida', 'essential', 35),
    (uid, sid, 'Transporte', 'Combustível', 'essential', 36),
    (uid, sid, 'Transporte', 'Transporte por aplicativo', 'essential', 37),
    (uid, sid, 'Transporte', 'Estacionamento', 'essential', 38),
    (uid, sid, 'Transporte', 'Manutenção e reparo', 'essential', 39),
    (uid, sid, 'Transporte', 'IPVA e licenciamento', 'essential', 40),
    (uid, sid, 'Impostos', 'Imposto de renda', 'essential', 41),
    (uid, sid, 'Impostos', 'Outros impostos', 'essential', 42),
    (uid, sid, 'Comida e bebida', 'Restaurantes', 'guilt_free', 43),
    (uid, sid, 'Comida e bebida', 'Entrega', 'guilt_free', 44),
    (uid, sid, 'Comida e bebida', 'Cafeteria', 'guilt_free', 45),
    (uid, sid, 'Comida e bebida', 'Bares e álcool', 'guilt_free', 46),
    (uid, sid, 'Entretenimento', 'Cinema', 'guilt_free', 47),
    (uid, sid, 'Entretenimento', 'Ingressos e shows', 'guilt_free', 48),
    (uid, sid, 'Entretenimento', 'Associações e clubes', 'guilt_free', 49),
    (uid, sid, 'Entretenimento', 'Outros entretenimentos', 'guilt_free', 50),
    (uid, sid, 'Viagem', 'Hospedagem', 'guilt_free', 51),
    (uid, sid, 'Viagem', 'Passagem aérea e taxas', 'guilt_free', 52),
    (uid, sid, 'Viagem', 'Outros gastos com viagem', 'guilt_free', 53),
    (uid, sid, 'Compras', 'Vestuário e acessórios', 'comfort', 54),
    (uid, sid, 'Compras', 'Eletrônicos', 'comfort', 55),
    (uid, sid, 'Compras', 'Presentes', 'comfort', 56),
    (uid, sid, 'Compras', 'Apps de música e vídeo', 'comfort', 57),
    (uid, sid, 'Compras', 'Outras compras', 'comfort', 58),
    (uid, sid, 'Esportes', 'Academia', 'comfort', 59),
    (uid, sid, 'Esportes', 'Outros esportes', 'comfort', 60),
    (uid, sid, 'Cuidados pessoais', 'Salão ou barbearia', 'comfort', 61),
    (uid, sid, 'Cuidados pessoais', 'Outros cuidados pessoais', 'comfort', 62),
    (uid, sid, 'Educação', 'Cursos de idiomas', 'education', 63),
    (uid, sid, 'Educação', 'Mensalidade escolar', 'education', 64),
    (uid, sid, 'Educação', 'Outros gastos com educação', 'education', 65),
    (uid, sid, 'Investimentos', 'Renda fixa', 'investment', 66),
    (uid, sid, 'Investimentos', 'Renda variável', 'investment', 67),
    (uid, sid, 'Investimentos', 'Previdência privada', 'investment', 68),
    (uid, sid, 'Investimentos', 'Tesouro direto', 'investment', 69),
    (uid, sid, 'Gastos diversos', 'Cartão de crédito', 'variable', 70),
    (uid, sid, 'Gastos diversos', 'Boleto', 'variable', 71),
    (uid, sid, 'Gastos diversos', 'Outros gastos', 'variable', 72),
    (uid, sid, 'Animais de estimação', 'Petshop', 'variable', 73),
    (uid, sid, 'Animais de estimação', 'Veterinário', 'variable', 74)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_settings (space_id, user_id)
  VALUES (sid, uid)
  ON CONFLICT DO NOTHING;

  IF EXISTS (SELECT 1 FROM public.budget_versions WHERE space_id = sid) THEN
    RETURN;
  END IF;

  INSERT INTO public.budget_versions (user_id, space_id, starts_month)
  SELECT uid, sid, date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date
  RETURNING id INTO v_version;

  INSERT INTO public.budget_group_targets (version_id, user_id, space_id, budget_group, target_bps)
  SELECT v_version, uid, sid, d.key, d.target_bps
  FROM (
    VALUES
      ('essential', 3300),
      ('comfort', 700),
      ('guilt_free', 700),
      ('education', 300),
      ('variable', 800),
      ('investment', 3200)
  ) AS d (key, target_bps);
END;
$function$;
--> statement-breakpoint
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
    JOIN public.categorization_rules r
      ON r.user_id = p_user AND r.space_id = p_space
      AND r.pattern = private.description_key(e.description)
      AND abs(e.amount_cents) BETWEEN r.min_cents AND r.max_cents
    WHERE e.user_id = p_user AND e.space_id = p_space
      AND e.kind <> 'transfer' AND e.recurrence = 'none'
      AND e.category_id IS NULL AND e.budget_group IS NULL
      AND EXISTS (
        SELECT 1 FROM public.bank_entry_links l
        WHERE l.entry_id = e.id AND l.user_id = p_user AND l.space_id = p_space
      )
    ORDER BY e.id, r.created_at DESC, r.id
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
  v_named integer := 0;
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
      private.feed_entry_description(a.description, a.merchant_name) AS out_description
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
       private.feed_entry_description(r.description, r.merchant_name), r.amount_cents, r.account_id,
       date_trunc('month', r.date)::date, extract(day FROM r.date)::smallint, 'none')
    RETURNING id INTO v_entry;
    INSERT INTO public.bank_entry_links (user_id, space_id, bank_transaction_id, entry_id)
    VALUES (p_user, p_space, r.id, v_entry);
    v_created := v_created + 1;
  END LOOP;

  -- 3a. Merchant names: a bank single whose description is still the bank's
  -- generic text (the user never edited it) takes the merchant's name.
  UPDATE public.entries e SET
    description = private.feed_entry_description(m.description, m.merchant_name),
    updated_at = now()
  FROM public.bank_entry_links l
  JOIN private.mapped_bank_transactions(p_user, p_space) m ON m.id = l.bank_transaction_id
  WHERE l.user_id = p_user AND l.space_id = p_space
    AND e.id = l.entry_id AND e.user_id = p_user AND e.space_id = p_space
    AND e.kind <> 'transfer' AND e.recurrence = 'none'
    AND e.description = m.description
    AND private.feed_entry_description(m.description, m.merchant_name) <> m.description;
  GET DIAGNOSTICS v_named = ROW_COUNT;

  -- 3b. Categorization rules, on bank entries still without category and budget group.
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
    'named', v_named
  );
END;
$function$;

-- `count_from_month` is gone (balances accumulate from each account's
-- opening balance over every entry): the space seed no longer reads it to
-- start the first budget version, which now starts in the current month
-- (São Paulo). Same lists as 0017 otherwise. Runs before the column is
-- dropped (next migration).
CREATE OR REPLACE FUNCTION public.seed_space_defaults(sid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid;
  plan uuid;
BEGIN
  SELECT s.user_id INTO uid FROM public.spaces s WHERE s.id = sid;
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unknown space %', sid;
  END IF;

  INSERT INTO public.pots (user_id, space_id, key, name, color, goal, sort)
  VALUES
    (uid, sid, 'essential', 'Essencial', 'violet', 'limit', 0),
    (uid, sid, 'comfort', 'Conforto', 'orange', 'limit', 1),
    (uid, sid, 'guilt_free', 'Livre', 'pink', 'limit', 2),
    (uid, sid, 'education', 'Educação', 'emerald', 'limit', 3),
    (uid, sid, 'variable', 'Variável', 'yellow', 'limit', 4),
    (uid, sid, 'investment', 'Investimento', 'blue', 'minimum', 5)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.categories (user_id, space_id, group_name, name, default_pot, sort)
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

  IF EXISTS (SELECT 1 FROM public.budget_plans WHERE space_id = sid) THEN
    RETURN;
  END IF;

  INSERT INTO public.budget_plans (user_id, space_id, starts_month)
  SELECT uid, sid, date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date
  RETURNING id INTO plan;

  INSERT INTO public.budget_plan_targets (plan_id, user_id, space_id, pot_key, target_bps)
  SELECT plan, uid, sid, d.key, d.target_bps
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
$$;--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.seed_space_defaults(uuid) FROM PUBLIC, anon, authenticated;

-- Contract of 0010: `budget_pots` (fixed targets per pot) was replaced by
-- `pots` + `budget_plans`. The seed functions stop writing/reading it, then
-- the table and its enum go. Same defaults as before (DEFAULT_POTS).
CREATE OR REPLACE FUNCTION public.seed_ledger_defaults(uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN

  INSERT INTO public.categories (user_id, group_name, name, default_pot, sort)
  VALUES
    (uid, 'Renda', 'Salário', NULL, 0),
    (uid, 'Renda', 'Décimo terceiro', NULL, 1),
    (uid, 'Renda', 'Férias', NULL, 2),
    (uid, 'Renda', 'Bônus', NULL, 3),
    (uid, 'Renda', 'PPR', NULL, 4),
    (uid, 'Renda', 'Benefícios', NULL, 5),
    (uid, 'Renda', 'Dividendos', NULL, 6),
    (uid, 'Renda', 'Juros recebidos', NULL, 7),
    (uid, 'Renda', 'Reembolso', NULL, 8),
    (uid, 'Renda', 'Outras receitas', NULL, 9),
    (uid, 'Moradia', 'Pagamento de aluguel', 'essential', 10),
    (uid, 'Moradia', 'Condomínio', 'essential', 11),
    (uid, 'Moradia', 'IPTU', 'essential', 12),
    (uid, 'Moradia', 'Manutenção e construção', 'essential', 13),
    (uid, 'Moradia', 'Outros gastos com moradia', 'essential', 14),
    (uid, 'Empréstimos', 'Financiamento de imóvel', 'essential', 15),
    (uid, 'Empréstimos', 'Financiamento de veículo', 'essential', 16),
    (uid, 'Empréstimos', 'Outros empréstimos', 'essential', 17),
    (uid, 'Mercado', 'Supermercado e mercearia', 'essential', 18),
    (uid, 'Mercado', 'Padaria', 'essential', 19),
    (uid, 'Mercado', 'Feira livre', 'essential', 20),
    (uid, 'Mercado', 'Outros gastos com mercado', 'essential', 21),
    (uid, 'Contas', 'Energia elétrica', 'essential', 22),
    (uid, 'Contas', 'Água e esgoto', 'essential', 23),
    (uid, 'Contas', 'Internet', 'essential', 24),
    (uid, 'Contas', 'Celular', 'essential', 25),
    (uid, 'Contas', 'Gás', 'essential', 26),
    (uid, 'Contas', 'Assinatura de serviços', 'essential', 27),
    (uid, 'Contas', 'Outras contas', 'essential', 28),
    (uid, 'Saúde', 'Farmácia', 'essential', 29),
    (uid, 'Saúde', 'Médico', 'essential', 30),
    (uid, 'Saúde', 'Dentista', 'essential', 31),
    (uid, 'Saúde', 'Psicólogo', 'essential', 32),
    (uid, 'Seguros', 'Plano de saúde', 'essential', 33),
    (uid, 'Seguros', 'Seguro de automóvel', 'essential', 34),
    (uid, 'Seguros', 'Seguro de vida', 'essential', 35),
    (uid, 'Transporte', 'Combustível', 'essential', 36),
    (uid, 'Transporte', 'Transporte por aplicativo', 'essential', 37),
    (uid, 'Transporte', 'Estacionamento', 'essential', 38),
    (uid, 'Transporte', 'Manutenção e reparo', 'essential', 39),
    (uid, 'Transporte', 'IPVA e licenciamento', 'essential', 40),
    (uid, 'Impostos', 'Imposto de renda', 'essential', 41),
    (uid, 'Impostos', 'Outros impostos', 'essential', 42),
    (uid, 'Comida e bebida', 'Restaurantes', 'guilt_free', 43),
    (uid, 'Comida e bebida', 'Entrega', 'guilt_free', 44),
    (uid, 'Comida e bebida', 'Cafeteria', 'guilt_free', 45),
    (uid, 'Comida e bebida', 'Bares e álcool', 'guilt_free', 46),
    (uid, 'Entretenimento', 'Cinema', 'guilt_free', 47),
    (uid, 'Entretenimento', 'Ingressos e shows', 'guilt_free', 48),
    (uid, 'Entretenimento', 'Associações e clubes', 'guilt_free', 49),
    (uid, 'Entretenimento', 'Outros entretenimentos', 'guilt_free', 50),
    (uid, 'Viagem', 'Hospedagem', 'guilt_free', 51),
    (uid, 'Viagem', 'Passagem aérea e taxas', 'guilt_free', 52),
    (uid, 'Viagem', 'Outros gastos com viagem', 'guilt_free', 53),
    (uid, 'Compras', 'Vestuário e acessórios', 'comfort', 54),
    (uid, 'Compras', 'Eletrônicos', 'comfort', 55),
    (uid, 'Compras', 'Presentes', 'comfort', 56),
    (uid, 'Compras', 'Apps de música e vídeo', 'comfort', 57),
    (uid, 'Compras', 'Outras compras', 'comfort', 58),
    (uid, 'Esportes', 'Academia', 'comfort', 59),
    (uid, 'Esportes', 'Outros esportes', 'comfort', 60),
    (uid, 'Cuidados pessoais', 'Salão ou barbearia', 'comfort', 61),
    (uid, 'Cuidados pessoais', 'Outros cuidados pessoais', 'comfort', 62),
    (uid, 'Educação', 'Cursos de idiomas', 'education', 63),
    (uid, 'Educação', 'Mensalidade escolar', 'education', 64),
    (uid, 'Educação', 'Outros gastos com educação', 'education', 65),
    (uid, 'Investimentos', 'Renda fixa', 'investment', 66),
    (uid, 'Investimentos', 'Renda variável', 'investment', 67),
    (uid, 'Investimentos', 'Previdência privada', 'investment', 68),
    (uid, 'Investimentos', 'Tesouro direto', 'investment', 69),
    (uid, 'Gastos diversos', 'Cartão de crédito', 'variable', 70),
    (uid, 'Gastos diversos', 'Boleto', 'variable', 71),
    (uid, 'Gastos diversos', 'Outros gastos', 'variable', 72),
    (uid, 'Animais de estimação', 'Petshop', 'variable', 73),
    (uid, 'Animais de estimação', 'Veterinário', 'variable', 74)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_settings (user_id)
  VALUES (uid)
  ON CONFLICT DO NOTHING;
END;
$$;--> statement-breakpoint

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

  INSERT INTO public.budget_plan_targets (plan_id, user_id, pot_key, target_bps)
  SELECT plan, uid, d.key, d.target_bps
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

DROP TABLE "budget_pots" CASCADE;--> statement-breakpoint
DROP TYPE "public"."pot_key";
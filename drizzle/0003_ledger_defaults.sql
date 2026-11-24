-- Ledger defaults for every user: the 6 budget pots, the category list and an
-- empty settings row. Seeded by the auth trigger (atomic with the profile) and
-- backfilled for existing profiles. Mirrors `DEFAULT_POTS` /
-- `DEFAULT_CATEGORY_GROUPS` (src/features/ledger/core/defaults.ts); the
-- Postgres suite fails if they drift. Idempotent (ON CONFLICT DO NOTHING).
CREATE OR REPLACE FUNCTION public.seed_ledger_defaults(uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.budget_pots (user_id, key, target_bps, sort)
  VALUES
    (uid, 'essential', 3300, 0),
    (uid, 'comfort', 700, 1),
    (uid, 'guilt_free', 700, 2),
    (uid, 'education', 300, 3),
    (uid, 'variable', 800, 4),
    (uid, 'investment', 3200, 5)
  ON CONFLICT DO NOTHING;

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

REVOKE EXECUTE ON FUNCTION public.seed_ledger_defaults(uuid) FROM PUBLIC, anon, authenticated;--> statement-breakpoint

-- Same as 0001_auth, plus the ledger defaults right after the profile exists.
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
  PERFORM public.seed_ledger_defaults(NEW.id);
  RETURN NEW;
END;
$$;--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;--> statement-breakpoint

SELECT public.seed_ledger_defaults(id) FROM public.profiles;

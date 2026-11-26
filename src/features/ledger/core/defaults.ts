import type { BudgetGroupColor, BudgetGroupGoal, BudgetGroupKey } from './types'

/**
 * Defaults every new space starts with. The database seeds them with
 * `public.seed_space_defaults` (migration `0017_spaces_seed`), called by the
 * `on_auth_user_created` trigger for the personal space and by the app for
 * every space the user creates; the Postgres suite asserts the seeded rows
 * equal these constants, so a change here needs a new migration that replaces
 * that function.
 */
export const DEFAULT_BUDGET_GROUPS: readonly {
  key: BudgetGroupKey
  name: string
  color: BudgetGroupColor
  goal: BudgetGroupGoal
  targetBps: number
}[] = [
  { key: 'essential', name: 'Essencial', color: 'violet', goal: 'limit', targetBps: 3300 },
  { key: 'comfort', name: 'Conforto', color: 'orange', goal: 'limit', targetBps: 700 },
  { key: 'guilt_free', name: 'Livre', color: 'pink', goal: 'limit', targetBps: 700 },
  { key: 'education', name: 'Educação', color: 'emerald', goal: 'limit', targetBps: 300 },
  { key: 'variable', name: 'Variável', color: 'yellow', goal: 'limit', targetBps: 800 },
  { key: 'investment', name: 'Investimento', color: 'blue', goal: 'minimum', targetBps: 3200 },
]

export type DefaultCategoryGroup = {
  group: string
  defaultBudgetGroup: BudgetGroupKey | null
  names: readonly string[]
}

/** The category group of income: only its categories offer splitting into dates. */
export const INCOME_CATEGORY_GROUP = 'Renda'

export const DEFAULT_CATEGORY_GROUPS: readonly DefaultCategoryGroup[] = [
  {
    group: INCOME_CATEGORY_GROUP,
    defaultBudgetGroup: null,
    names: [
      'Salário',
      'Décimo terceiro',
      'Férias',
      'Bônus',
      'PPR',
      'Benefícios',
      'Dividendos',
      'Juros recebidos',
      'Reembolso',
      'Outras receitas',
    ],
  },
  {
    group: 'Moradia',
    defaultBudgetGroup: 'essential',
    names: [
      'Pagamento de aluguel',
      'Condomínio',
      'IPTU',
      'Manutenção e construção',
      'Outros gastos com moradia',
    ],
  },
  {
    group: 'Empréstimos',
    defaultBudgetGroup: 'essential',
    names: ['Financiamento de imóvel', 'Financiamento de veículo', 'Outros empréstimos'],
  },
  {
    group: 'Mercado',
    defaultBudgetGroup: 'essential',
    names: ['Supermercado e mercearia', 'Padaria', 'Feira livre', 'Outros gastos com mercado'],
  },
  {
    group: 'Contas',
    defaultBudgetGroup: 'essential',
    names: [
      'Energia elétrica',
      'Água e esgoto',
      'Internet',
      'Celular',
      'Gás',
      'Assinatura de serviços',
      'Outras contas',
    ],
  },
  {
    group: 'Saúde',
    defaultBudgetGroup: 'essential',
    names: ['Farmácia', 'Médico', 'Dentista', 'Psicólogo'],
  },
  {
    group: 'Seguros',
    defaultBudgetGroup: 'essential',
    names: ['Plano de saúde', 'Seguro de automóvel', 'Seguro de vida'],
  },
  {
    group: 'Transporte',
    defaultBudgetGroup: 'essential',
    names: [
      'Combustível',
      'Transporte por aplicativo',
      'Estacionamento',
      'Manutenção e reparo',
      'IPVA e licenciamento',
    ],
  },
  {
    group: 'Impostos',
    defaultBudgetGroup: 'essential',
    names: ['Imposto de renda', 'Outros impostos'],
  },
  {
    group: 'Comida e bebida',
    defaultBudgetGroup: 'guilt_free',
    names: ['Restaurantes', 'Entrega', 'Cafeteria', 'Bares e álcool'],
  },
  {
    group: 'Entretenimento',
    defaultBudgetGroup: 'guilt_free',
    names: ['Cinema', 'Ingressos e shows', 'Associações e clubes', 'Outros entretenimentos'],
  },
  {
    group: 'Viagem',
    defaultBudgetGroup: 'guilt_free',
    names: ['Hospedagem', 'Passagem aérea e taxas', 'Outros gastos com viagem'],
  },
  {
    group: 'Compras',
    defaultBudgetGroup: 'comfort',
    names: [
      'Vestuário e acessórios',
      'Eletrônicos',
      'Presentes',
      'Apps de música e vídeo',
      'Outras compras',
    ],
  },
  {
    group: 'Esportes',
    defaultBudgetGroup: 'comfort',
    names: ['Academia', 'Outros esportes'],
  },
  {
    group: 'Cuidados pessoais',
    defaultBudgetGroup: 'comfort',
    names: ['Salão ou barbearia', 'Outros cuidados pessoais'],
  },
  {
    group: 'Educação',
    defaultBudgetGroup: 'education',
    names: ['Cursos de idiomas', 'Mensalidade escolar', 'Outros gastos com educação'],
  },
  {
    group: 'Investimentos',
    defaultBudgetGroup: 'investment',
    names: ['Renda fixa', 'Renda variável', 'Previdência privada', 'Tesouro direto'],
  },
  {
    group: 'Gastos diversos',
    defaultBudgetGroup: 'variable',
    names: ['Cartão de crédito', 'Boleto', 'Outros gastos'],
  },
  {
    group: 'Animais de estimação',
    defaultBudgetGroup: 'variable',
    names: ['Petshop', 'Veterinário'],
  },
]

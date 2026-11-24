import type { PotKey } from './types'

/**
 * Defaults every new user starts with. The database seeds them from the
 * `on_auth_user_created` trigger (migration `0003_ledger_defaults`); the
 * Postgres suite asserts the seeded rows equal these constants, so a change
 * here needs a new migration that replaces `public.seed_ledger_defaults`.
 */
export const DEFAULT_POTS: readonly { key: PotKey; targetBps: number }[] = [
  { key: 'essential', targetBps: 3300 },
  { key: 'comfort', targetBps: 700 },
  { key: 'guilt_free', targetBps: 700 },
  { key: 'education', targetBps: 300 },
  { key: 'variable', targetBps: 800 },
  { key: 'investment', targetBps: 3200 },
]

export type DefaultCategoryGroup = {
  group: string
  defaultPot: PotKey | null
  names: readonly string[]
}

/** The category group of income: only its categories offer splitting into dates. */
export const INCOME_CATEGORY_GROUP = 'Renda'

export const DEFAULT_CATEGORY_GROUPS: readonly DefaultCategoryGroup[] = [
  {
    group: INCOME_CATEGORY_GROUP,
    defaultPot: null,
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
    defaultPot: 'essential',
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
    defaultPot: 'essential',
    names: ['Financiamento de imóvel', 'Financiamento de veículo', 'Outros empréstimos'],
  },
  {
    group: 'Mercado',
    defaultPot: 'essential',
    names: ['Supermercado e mercearia', 'Padaria', 'Feira livre', 'Outros gastos com mercado'],
  },
  {
    group: 'Contas',
    defaultPot: 'essential',
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
    defaultPot: 'essential',
    names: ['Farmácia', 'Médico', 'Dentista', 'Psicólogo'],
  },
  {
    group: 'Seguros',
    defaultPot: 'essential',
    names: ['Plano de saúde', 'Seguro de automóvel', 'Seguro de vida'],
  },
  {
    group: 'Transporte',
    defaultPot: 'essential',
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
    defaultPot: 'essential',
    names: ['Imposto de renda', 'Outros impostos'],
  },
  {
    group: 'Comida e bebida',
    defaultPot: 'guilt_free',
    names: ['Restaurantes', 'Entrega', 'Cafeteria', 'Bares e álcool'],
  },
  {
    group: 'Entretenimento',
    defaultPot: 'guilt_free',
    names: ['Cinema', 'Ingressos e shows', 'Associações e clubes', 'Outros entretenimentos'],
  },
  {
    group: 'Viagem',
    defaultPot: 'guilt_free',
    names: ['Hospedagem', 'Passagem aérea e taxas', 'Outros gastos com viagem'],
  },
  {
    group: 'Compras',
    defaultPot: 'comfort',
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
    defaultPot: 'comfort',
    names: ['Academia', 'Outros esportes'],
  },
  {
    group: 'Cuidados pessoais',
    defaultPot: 'comfort',
    names: ['Salão ou barbearia', 'Outros cuidados pessoais'],
  },
  {
    group: 'Educação',
    defaultPot: 'education',
    names: ['Cursos de idiomas', 'Mensalidade escolar', 'Outros gastos com educação'],
  },
  {
    group: 'Investimentos',
    defaultPot: 'investment',
    names: ['Renda fixa', 'Renda variável', 'Previdência privada', 'Tesouro direto'],
  },
  {
    group: 'Gastos diversos',
    defaultPot: 'variable',
    names: ['Cartão de crédito', 'Boleto', 'Outros gastos'],
  },
  {
    group: 'Animais de estimação',
    defaultPot: 'variable',
    names: ['Petshop', 'Veterinário'],
  },
]

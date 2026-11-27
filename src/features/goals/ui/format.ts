import type { GoalKind } from '@/features/goals/core/goals'
import { EMERGENCY_MONTHS } from '@/features/goals/core/goals'
import { formatBRLFromCents } from '@cbrl/br/money'

/** Money and duration labels shared by the goals screen and its dialog. */

export const brl = (cents: number) => formatBRLFromCents(Math.round(cents))

/** "R$ 2,70 mi", "R$ 95 mil" or the full amount below R$ 10 mil. */
export function short(cents: number): string {
  if (cents >= 100_000_000) return `R$ ${(cents / 100_000_000).toFixed(2).replace('.', ',')} mi`
  if (cents >= 1_000_000) return `R$ ${Math.round(cents / 100_000)} mil`
  return brl(cents)
}

export function duration(months: number | null): string {
  if (months === null) return 'mais de 70 anos'
  if (months === 0) return 'já'
  if (months < 24) return `${months} ${months === 1 ? 'mês' : 'meses'}`
  return `${(months / 12).toFixed(1).replace('.', ',')} anos`
}

export const KIND_LABELS: Record<GoalKind, string> = {
  emergency: 'Reserva de emergência',
  independence: 'Independência financeira',
  purchase: 'Compra ou evento',
  recurring: 'Todo ano',
}

export const KIND_HINTS: Record<GoalKind, string> = {
  emergency: `${EMERGENCY_MONTHS} meses do seu gasto essencial; enche primeiro`,
  independence: 'Viver de renda; recebe o que sobra do pote',
  purchase: 'Carro, casamento, entrada de imóvel',
  recurring: 'Viagem anual, IPVA, presentes',
}

import { formatBRLFromCents } from '@cbrl/br/money'
import type { ImportStats } from './plan'
import type { ComparisonRow, Verification } from './verify'

/**
 * The importer's console report. Aggregates only (counts and totals): never a
 * description, a single amount or any other row-level detail.
 */

export type CategoryCounts = { toCreate: number; reused: number }

export type ReportInput = {
  stats: ImportStats
  counts: { banks: number; accounts: number; archivedAccounts: number; payments: number }
  categories: CategoryCounts
  verification: Verification
  /** Label shown instead of an account id (e.g. "#3 credit"). */
  accountLabel: (id: string) => string
}

const pad = (text: string | number, width: number) => String(text).padStart(width)

function comparisonLines(
  title: string,
  rows: readonly ComparisonRow[],
  label: (key: string) => string,
) {
  const money = (cents: number) => pad(formatBRLFromCents(cents), 18)
  const lines = [
    title,
    `  ${'chave'.padEnd(18)}${pad('entradas Notion', 18)}${pad('entradas Fluxi', 18)}${pad('saídas Notion', 18)}${pad('saídas Fluxi', 18)}  ok`,
  ]
  for (const row of rows) {
    const ok =
      row.notion.inflowCents === row.fluxi.inflowCents &&
      row.notion.outflowCents === row.fluxi.outflowCents
    lines.push(
      `  ${label(row.key).padEnd(18)}${money(row.notion.inflowCents)}${money(row.fluxi.inflowCents)}${money(row.notion.outflowCents)}${money(row.fluxi.outflowCents)}  ${ok ? 'sim' : 'NÃO'}`,
    )
  }
  return lines
}

export function formatReport(input: ReportInput): string[] {
  const { stats, counts, categories, verification } = input
  const r = stats.entriesByRecurrence
  return [
    'Importação Notion → Fluxi',
    `  transações no Notion:        ${stats.transactions}`,
    `    ignoradas:                 ${stats.skipped.ignored}`,
    `    incompletas:               ${stats.skipped.incomplete}`,
    `    sem mês:                   ${stats.skipped.noMonth}`,
    `    importáveis:               ${stats.importable}`,
    `    valor negativo (invertido): ${stats.negativeFlipped}`,
    `    só valor zero (fora):      ${stats.zeroOnlyRuns} série(s)`,
    `  transferências pareadas:     ${stats.transfersPaired}`,
    `  lançamentos:                 ${r.none + r.monthly + r.yearly} (mensal ${r.monthly}, anual ${r.yearly}, único ${r.none})`,
    `  exceções de valor/dia:       ${stats.valueOrDayOverrides}`,
    `  meses pulados:               ${stats.skippedMonths}`,
    `  pagamentos (pago em):        ${counts.payments}`,
    `  categorias:                  ${categories.toCreate} novas, ${categories.reused} reaproveitadas`,
    `  bancos / contas:             ${counts.banks} / ${counts.accounts} (${counts.archivedAccounts} arquivadas)`,
    '',
    ...comparisonLines('Verificação por ano', verification.byYear, (key) => key),
    '',
    ...comparisonLines('Verificação por conta', verification.byAccount, input.accountLabel),
    '',
    `Divergências (mês × conta × movimento): ${verification.divergences}`,
  ]
}

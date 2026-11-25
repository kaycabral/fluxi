import { bucketOfType } from '@/features/ledger/core/bucket'
import type { AccountType, Entry, EntryOverride, PotKey } from '@/features/ledger/core/types'
import { categoryKeyOf, planCategories, potOfEntry, type PlannedCategory } from './categories'
import { groupIntoEntries, type PlannedEntry } from './grouping'
import { toItems } from './items'
import { dropBenefitMirrors } from './mirrors'
import { relationOf, selectOf, textOf, type NotionPage, type NotionSource } from './notion'
import { buildMonthIndex, toRecords, type RecordSkips } from './records'
import { signedFlowCents, verifyLedger, type Flow, type Verification } from './verify'

/**
 * The whole Notion → fluxi import as data: what to create and how it maps
 * back to the Notion rows. Ids are local (Notion page ids for banks/accounts,
 * `e<n>` for entries, category keys); the adapter assigns database ids.
 */

/** First month Fluxi counts balances from (`user_settings.count_from_month`). */
export const COUNT_FROM_MONTH = '2026-12'

/** A Notion money movement with the row it came from. */
export type SourceFlow = Flow & { externalId: string }

export type PlannedBank = { externalId: string; name: string; archived: boolean; sort: number }

export type PlannedAccount = {
  externalId: string
  bankExternalId: string
  name: string
  type: AccountType
  archived: boolean
}

export type PlannedLedgerEntry = PlannedEntry & {
  pot: PotKey | null
  categoryKey: string | null
}

export type PlannedPayment = { entryKey: string; month: string; paidOn: string }

export type PlannedLink = { externalId: string; entryKey: string; month: string }

export type ImportStats = {
  transactions: number
  skipped: RecordSkips
  importable: number
  negativeFlipped: number
  zeroOnlyRuns: number
  transfersPaired: number
  /** Future benefit mirror outflows left out on purpose (see `dropBenefitMirrors`). */
  mirrorsDropped: number
  entriesByRecurrence: Record<PlannedEntry['recurrence'], number>
  valueOrDayOverrides: number
  skippedMonths: number
}

export type ImportPlan = {
  banks: PlannedBank[]
  accounts: PlannedAccount[]
  categories: PlannedCategory[]
  entries: PlannedLedgerEntry[]
  payments: PlannedPayment[]
  links: PlannedLink[]
  /** Every importable Notion money movement (account = Notion id). */
  originals: SourceFlow[]
  /** Notion rows deliberately not imported (future benefit mirrors). */
  droppedExternalIds: string[]
  stats: ImportStats
}

const ACCOUNT_TYPES: Readonly<Record<string, AccountType>> = {
  Checking: 'checking',
  Credit: 'credit',
  Benefit: 'benefit',
  Loan: 'loan',
  Investment: 'investment',
}

const isInactive = (page: NotionPage) => selectOf(page, 'Status') === 'Inactive'

function planBanks(pages: readonly NotionPage[]): PlannedBank[] {
  return pages.map((page, sort) => ({
    externalId: page.id,
    name: textOf(page, 'Name').trim() || 'Banco',
    archived: isInactive(page),
    sort,
  }))
}

function planAccounts(
  pages: readonly NotionPage[],
  banks: readonly PlannedBank[],
): PlannedAccount[] {
  const bankIds = new Set(banks.map((b) => b.externalId))
  return pages.map((page) => {
    const bankExternalId = relationOf(page, 'Bank')[0]
    const typeName = selectOf(page, 'Type') ?? ''
    const type = ACCOUNT_TYPES[typeName]
    if (bankExternalId === undefined || !bankIds.has(bankExternalId)) {
      throw new Error(`notion account ${page.id} has no known bank`)
    }
    if (type === undefined)
      throw new Error(`notion account ${page.id} has unknown type "${typeName}"`)
    return {
      externalId: page.id,
      bankExternalId,
      name: textOf(page, 'Name').trim() || 'Conta',
      type,
      archived: isInactive(page),
    }
  })
}

function paymentsOf(entry: PlannedEntry): PlannedPayment[] {
  return entry.occurrences.flatMap(({ month, item }) =>
    item.paidOn === null || item.amountCents === 0
      ? []
      : [{ entryKey: entry.key, month, paidOn: item.paidOn }],
  )
}

function linksOf(entry: PlannedEntry): PlannedLink[] {
  return entry.occurrences.flatMap(({ month, item }) =>
    item.externalIds.map((externalId) => ({ externalId, entryKey: entry.key, month })),
  )
}

function statsOf(entries: readonly PlannedEntry[]) {
  const entriesByRecurrence = { none: 0, monthly: 0, yearly: 0 }
  let valueOrDayOverrides = 0
  let skippedMonths = 0
  for (const entry of entries) {
    entriesByRecurrence[entry.recurrence] += 1
    for (const o of entry.overrides) {
      if (o.skipped) skippedMonths += 1
      else valueOrDayOverrides += 1
    }
  }
  return { entriesByRecurrence, valueOrDayOverrides, skippedMonths }
}

/** Builds the plan from the raw workspace (pure; throws on unmappable accounts). */
export function buildImportPlan(
  source: NotionSource,
  options: { countFrom?: string } = {},
): ImportPlan {
  const banks = planBanks(source.banks)
  const accounts = planAccounts(source.accounts, banks)
  const known = new Set(accounts.map((a) => a.externalId))
  const { records, skipped, negativeFlipped } = toRecords(
    source.transactions,
    buildMonthIndex(source.months, source.years),
  )
  const unknown = records.find((r) => !known.has(r.accountId))
  if (unknown !== undefined) {
    throw new Error(`notion transaction ${unknown.externalId} points at an unknown account`)
  }
  const { items, transfersPaired } = toItems(records)
  const benefitIds = new Set(
    accounts.filter((a) => bucketOfType(a.type) === 'benefit').map((a) => a.externalId),
  )
  const mirrors = dropBenefitMirrors(items, benefitIds, options.countFrom ?? COUNT_FROM_MONTH)
  const { entries, zeroOnlyRuns } = groupIntoEntries(mirrors.kept)
  return {
    banks,
    accounts,
    categories: planCategories(entries),
    entries: entries.map((e) => ({ ...e, pot: potOfEntry(e), categoryKey: categoryKeyOf(e) })),
    payments: entries.flatMap(paymentsOf),
    links: entries.flatMap(linksOf),
    originals: records.map((r) => ({
      externalId: r.externalId,
      month: r.month,
      accountId: r.accountId,
      amountCents: signedFlowCents(r.movement, r.amountCents),
    })),
    droppedExternalIds: mirrors.dropped.flatMap((item) => item.externalIds),
    stats: {
      transactions: source.transactions.length,
      skipped,
      importable: records.length,
      negativeFlipped,
      zeroOnlyRuns,
      transfersPaired,
      mirrorsDropped: mirrors.dropped.length,
      ...statsOf(entries),
    },
  }
}

/** The plan's entries/overrides as ledger domain rows (ids local to the plan). */
export function planAsLedger(plan: ImportPlan): { entries: Entry[]; overrides: EntryOverride[] } {
  return {
    entries: plan.entries.map((e) => ({
      id: e.key,
      kind: e.kind,
      description: e.description,
      amountCents: e.amountCents,
      accountId: e.accountId,
      toAccountId: e.toAccountId,
      categoryId: e.categoryKey,
      pot: e.pot,
      tags: e.tags,
      startMonth: e.startMonth,
      day: e.day,
      recurrence: e.recurrence,
      repeatEvery: 1,
      monthBy: 'day',
      installments: null,
      endMonth: e.endMonth,
    })),
    // The import only skips months; it never deletes an occurrence.
    overrides: plan.entries.flatMap((e) =>
      e.overrides.map((o) => ({ entryId: e.key, ...o, deleted: false })),
    ),
  }
}

/**
 * What the ledger must reproduce: the Notion originals minus the rows the
 * plan dropped explicitly (nothing else may go missing).
 */
export function expectedFlows(
  plan: Pick<ImportPlan, 'originals' | 'droppedExternalIds'>,
): SourceFlow[] {
  const dropped = new Set(plan.droppedExternalIds)
  return plan.originals.filter((flow) => !dropped.has(flow.externalId))
}

/** Verifies the plan itself before anything is written. */
export function verifyPlan(plan: ImportPlan): Verification {
  return verifyLedger(expectedFlows(plan), planAsLedger(plan))
}

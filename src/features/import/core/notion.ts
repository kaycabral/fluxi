/**
 * The subset of the Notion API (version 2025-09-03) page shape the importer
 * reads, and typed accessors for its properties. Pages arrive as untyped JSON;
 * every accessor narrows defensively and returns null/[] for a missing or
 * differently typed property instead of throwing.
 */

export type NotionPage = {
  id: string
  properties: Record<string, unknown>
}

/** The workspace, as raw pages per data source. */
export type NotionSource = {
  transactions: readonly NotionPage[]
  months: readonly NotionPage[]
  accounts: readonly NotionPage[]
  banks: readonly NotionPage[]
  years: readonly NotionPage[]
}

export const NOTION_KINDS = ['transactions', 'months', 'accounts', 'banks', 'years'] as const
export type NotionKind = (typeof NOTION_KINDS)[number]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Narrows one item of a Notion API result list to a page. */
export function isNotionPage(value: unknown): value is NotionPage {
  return isRecord(value) && typeof value.id === 'string' && isRecord(value.properties)
}

function property(page: NotionPage, name: string, type: string): unknown {
  const prop = page.properties[name]
  if (!isRecord(prop) || prop.type !== type) return null
  return prop[type]
}

function stringField(value: unknown, field: string): string | null {
  if (!isRecord(value)) return null
  const inner = value[field]
  return typeof inner === 'string' ? inner : null
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Concatenated plain text of a `title` or `rich_text` property. */
export function textOf(page: NotionPage, name: string): string {
  const type = isRecord(page.properties[name]) ? page.properties[name].type : null
  if (type !== 'title' && type !== 'rich_text') return ''
  return list(property(page, name, type))
    .map((item) => stringField(item, 'plain_text') ?? '')
    .join('')
}

export function numberOf(page: NotionPage, name: string): number | null {
  const value = property(page, name, 'number')
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function selectOf(page: NotionPage, name: string): string | null {
  return stringField(property(page, name, 'select'), 'name')
}

export function multiSelectOf(page: NotionPage, name: string): string[] {
  return list(property(page, name, 'multi_select'))
    .map((item) => stringField(item, 'name'))
    .filter((item): item is string => item !== null)
}

export function relationOf(page: NotionPage, name: string): string[] {
  return list(property(page, name, 'relation'))
    .map((item) => stringField(item, 'id'))
    .filter((item): item is string => item !== null)
}

/** Start of a `date` property, as given (`YYYY-MM-DD` or an ISO datetime). */
export function dateOf(page: NotionPage, name: string): string | null {
  return stringField(property(page, name, 'date'), 'start')
}

export function checkboxOf(page: NotionPage, name: string): boolean {
  return property(page, name, 'checkbox') === true
}

import {
  isNotionPage,
  NOTION_KINDS,
  type NotionKind,
  type NotionPage,
  type NotionSource,
} from '@/features/import/core/notion'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

/**
 * Reads the finance workspace from the Notion API (version 2025-09-03): every
 * page of each data source, paginated, retrying on rate limits. The token
 * comes from `NOTION_TOKEN` or `~/.config/fluxi/notion.env` and is never
 * logged.
 */

const API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2025-09-03'
const MAX_ATTEMPTS = 6

export const DATA_SOURCES: Readonly<Record<NotionKind, string>> = {
  transactions: '4fad89b6-54de-44cb-99d4-145438403394',
  months: '1a9b7e82-519f-8041-b683-000b9c6ea64c',
  accounts: '1a9b7e82-519f-806d-b08e-000b73be0eda',
  banks: '1a9b7e82-519f-80f7-83b0-000be48d9a7d',
  years: '1a9b7e82-519f-800f-90b2-000bb0ab6b55',
}

export async function readNotionToken(): Promise<string> {
  const fromEnv = process.env.NOTION_TOKEN?.trim()
  if (fromEnv) return fromEnv
  const file = path.join(homedir(), '.config', 'fluxi', 'notion.env')
  const content = await readFile(file, 'utf8').catch(() => '')
  const line = content.split('\n').find((l) => l.startsWith('NOTION_TOKEN='))
  const token = line?.slice('NOTION_TOKEN='.length).trim()
  if (!token) throw new Error('NOTION_TOKEN is not set (env or ~/.config/fluxi/notion.env)')
  return token
}

type QueryPage = { results: unknown[]; hasMore: boolean; nextCursor: string | null }

function parseQueryPage(json: unknown): QueryPage {
  if (typeof json !== 'object' || json === null) throw new Error('notion: unexpected response')
  const results = 'results' in json && Array.isArray(json.results) ? json.results : []
  const hasMore = 'has_more' in json && json.has_more === true
  const nextCursor =
    'next_cursor' in json && typeof json.next_cursor === 'string' ? json.next_cursor : null
  return { results, hasMore, nextCursor }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function post(token: string, url: string, body: object): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const retryable = response.status === 429 || response.status >= 500
    if (response.ok) return response.json()
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      throw new Error(`notion: HTTP ${response.status} querying a data source`)
    }
    const retryAfter = Number(response.headers.get('retry-after'))
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : attempt * 1000)
  }
}

async function queryAll(token: string, dataSourceId: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = []
  let cursor: string | null = null
  do {
    const body: Record<string, unknown> = { page_size: 100 }
    if (cursor !== null) body.start_cursor = cursor
    const page = parseQueryPage(
      await post(token, `${API}/data_sources/${dataSourceId}/query`, body),
    )
    pages.push(...page.results.filter(isNotionPage))
    cursor = page.hasMore ? page.nextCursor : null
  } while (cursor !== null)
  return pages
}

/** Every page of the five data sources. */
export async function fetchNotionSource(token: string): Promise<NotionSource> {
  return collect((kind) => queryAll(token, DATA_SOURCES[kind]))
}

/** The same shape from a local dump (`<dir>/<kind>.json`, raw API pages). */
export async function readNotionDump(dir: string): Promise<NotionSource> {
  return collect(async (kind) => {
    const json: unknown = JSON.parse(await readFile(path.join(dir, `${kind}.json`), 'utf8'))
    return Array.isArray(json) ? json.filter(isNotionPage) : []
  })
}

async function collect(load: (kind: NotionKind) => Promise<NotionPage[]>): Promise<NotionSource> {
  const [transactions, months, accounts, banks, years] = await Promise.all(NOTION_KINDS.map(load))
  return {
    transactions: transactions ?? [],
    months: months ?? [],
    accounts: accounts ?? [],
    banks: banks ?? [],
    years: years ?? [],
  }
}

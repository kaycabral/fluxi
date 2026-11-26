import { z } from 'zod'
import {
  pluggyAccountSchema,
  pluggyItemSchema,
  pluggyTransactionSchema,
  transactionsPageSchema,
  type PluggyAccount,
  type PluggyConfig,
  type PluggyItem,
  type PluggyTransaction,
} from '../core/pluggy.ts'

/**
 * Minimal Pluggy API client for the personal (Meu Pluggy) feed. The client
 * secret only lives in this process: it is exchanged for a short-lived API key
 * (POST /auth) and never logged. Retries 429/5xx with backoff. Web-standard
 * `fetch` only, so the `pluggy-sync` Edge Function (Deno) imports it as is.
 */

const API = 'https://api.pluggy.ai'
const MAX_ATTEMPTS = 5

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const errorSchema = z.object({ message: z.string().optional(), code: z.number().optional() })

async function request(url: string, init: RequestInit): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, init)
    if (response.ok) return response.json()
    const retryable = response.status === 429 || response.status >= 500
    if (retryable && attempt < MAX_ATTEMPTS) {
      await sleep(500 * 2 ** attempt)
      continue
    }
    const body = errorSchema.safeParse(await response.json().catch(() => ({})))
    const message = body.success && body.data.message ? `: ${body.data.message}` : ''
    throw new Error(
      `pluggy ${init.method ?? 'GET'} ${new URL(url).pathname} → ${response.status}${message}`,
    )
  }
}

export type PluggyClient = {
  getItem(itemId: string): Promise<PluggyItem>
  listAccounts(itemId: string): Promise<PluggyAccount[]>
  listTransactions(accountId: string): Promise<PluggyTransaction[]>
}

export async function createPluggyClient(
  config: Pick<PluggyConfig, 'clientId' | 'clientSecret'>,
): Promise<PluggyClient> {
  const auth = z.object({ apiKey: z.string() }).parse(
    await request(`${API}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: config.clientId, clientSecret: config.clientSecret }),
    }),
  )
  const get = (pathAndQuery: string) =>
    request(`${API}${pathAndQuery}`, { headers: { 'X-API-KEY': auth.apiKey } })

  return {
    async getItem(itemId) {
      return pluggyItemSchema.parse(await get(`/items/${encodeURIComponent(itemId)}`))
    },
    async listAccounts(itemId) {
      const out: PluggyAccount[] = []
      for (let page = 1; ; page++) {
        const json = z
          .object({ results: z.array(pluggyAccountSchema), totalPages: z.number() })
          .parse(
            await get(`/accounts?itemId=${encodeURIComponent(itemId)}&pageSize=500&page=${page}`),
          )
        out.push(...json.results)
        if (page >= json.totalPages) return out
      }
    },
    async listTransactions(accountId) {
      const out: PluggyTransaction[] = []
      // Cursor pagination: `next` is a ready-made query string for /v2/transactions.
      let next: string | null = `?accountId=${encodeURIComponent(accountId)}`
      while (next !== null) {
        const page = transactionsPageSchema.parse(await get(`/v2/transactions${next}`))
        out.push(...page.results.map((r) => pluggyTransactionSchema.parse(r)))
        next = page.next
      }
      return out
    },
  }
}

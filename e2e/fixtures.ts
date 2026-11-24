import path from 'node:path'

import { test as base, expect } from '@playwright/test'

import { BASE_URL, USER_DISPLAY_NAME } from './constants'
import { recreateAuthUser } from './seed'

const USER_PASSWORD = 'e2e-user-password'

export function userEmail(workerIndex: number): string {
  return `user-w${workerIndex}@e2e.test`
}

type WorkerFixtures = {
  // One account per parallel worker, so parallel workers never race on the
  // same user's data (Playwright's one-account-per-worker pattern). Tests
  // within a worker run serially, so there's no intra-worker race either.
  userId: string
  userStorageState: string
}

type TestFixtures = {
  // Opt-in (per `test.use`): run the test authenticated as the worker's user.
  authAsUser: boolean
  user: { id: string; email: string }
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  userId: [
    async ({}, use, workerInfo) => {
      const id = await recreateAuthUser({
        email: userEmail(workerInfo.workerIndex),
        password: USER_PASSWORD,
        displayName: USER_DISPLAY_NAME,
      })
      await use(id)
    },
    { scope: 'worker' },
  ],

  userStorageState: [
    async ({ browser, userId }, use, workerInfo) => {
      const file = path.resolve(process.cwd(), 'e2e/.auth', `user-${workerInfo.workerIndex}.json`)
      const context = await browser.newContext({ baseURL: BASE_URL })
      // The test-only route signs in with the Supabase server client, which
      // writes the real session cookies into this context.
      const res = await context.request.post('/api/e2e-signin', {
        data: { email: userEmail(workerInfo.workerIndex), password: USER_PASSWORD },
      })
      expect(res.ok(), `POST /api/e2e-signin failed: ${res.status()}`).toBeTruthy()
      expect(await res.json()).toEqual({ userId })
      await context.storageState({ path: file })
      await context.close()
      await use(file)
    },
    // The first request compiles the route in `next dev`; give it room.
    { scope: 'worker', timeout: 60_000 },
  ],

  authAsUser: [false, { option: true }],

  storageState: async ({ authAsUser, userStorageState }, use) => {
    await use(authAsUser ? userStorageState : undefined)
  },

  user: async ({ userId }, use, testInfo) => {
    await use({ id: userId, email: userEmail(testInfo.workerIndex) })
  },
})

export { expect }

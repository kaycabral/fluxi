// Single source for the dev port: the `dev` script runs `next dev -p 3004`, so
// playwright.config (baseURL + webServer url) and the worker auth fixture all
// derive from it — no drift.
export const E2E_PORT = 3004
export const BASE_URL = `http://127.0.0.1:${E2E_PORT}`

// The user account is created per parallel worker in `fixtures.ts`
// (`user-w<workerIndex>@e2e.test`); only the shared display name lives here.
export const USER_DISPLAY_NAME = 'Usuário E2E'

# fluxi

Planejador de fluxo de caixa pessoal: um app Next.js na raiz do repo, com Supabase (Postgres e Auth). Multiusuário (qualquer conta Google entra). Sem workspaces nem turbo.

## Layout

| Caminho                                   | Papel                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `src/app`, `src/components`, `src/hooks`… | App Next.js (App Router): `/` (landing + login) e `/painel` (logado)  |
| `src/db`                                  | Schema Drizzle, queries e seed do Postgres (`@/db`)                   |
| `drizzle/`, `drizzle.config.ts`           | Migrations versionadas                                                |
| `scripts/`                                | `migrate.ts` (prod/CI), `migrate-local.ts`, `local-env.ts`, `seed.ts` |
| `e2e/`, `src/**/_e2e/`, `_smoke/`         | Playwright (fixtures, specs E2E, smoke pós-deploy)                    |
| `supabase/`                               | Config do stack local (Docker)                                        |

Rotas em português (`/painel`, `/painel/...`); código em inglês.

## Regras invioláveis

1. **Next.js: leia a doc local antes de codar.** `node_modules/next/dist/docs/` é a fonte de verdade; o conhecimento de treino está defasado.
2. **pnpm apenas.** Nunca `npm`/`yarn`/`bun`.
3. **Aliases.** `@/...` pra tudo em `src/` (`@/db`, `@/lib/...`), `@e2e/*` pra `e2e/`. Nunca `../../`.
4. **Codebase em inglês.** Identificadores, comentários, mensagens de erro, logs, nomes de eventos. UI em pt-BR.
5. **ESLint: nunca desabilitar.** Sem `eslint-disable*`. Dívida antiga vive no `eslint-suppressions.json` (catraca: violação nova falha).
6. **Tipagem sem escape hatches.** Sem `any`, `as any`, `as unknown as X`, `@ts-ignore`.
7. **Primitivos UI vêm do `@cbrl/design`** (shadcn sobre Radix). Não copiar componente pro app; variante que falta vai pro `@cbrl/design` no toolkit. Exceção: `src/components/ui/form.tsx` (binding do `react-hook-form`, não é primitivo visual).
8. **Sem merge sem evidência de execução real** (spec E2E, log de `pnpm test` cobrindo o caminho, ou smoke manual descrito no PR).

## Gates

```bash
pnpm format:check
pnpm lint        # next typegen + eslint
pnpm typecheck
pnpm test        # vitest (unit, com catraca de cobertura)
pnpm build
```

Ambiente local (stack Supabase via Docker): `pnpm db:start` (sobe o stack + `db:migrate:local`) → `pnpm db:env` (grava `.env.local`) → `pnpm db:seed` → `pnpm dev` (porta 3004). O login Google não roda local; use o login de teste indicado pelo `db:seed`. Studio em http://127.0.0.1:54423. Suíte Postgres: `POSTGRES_URL=<stack local> pnpm test:integration:pg`; E2E: `pnpm test:e2e`.

**Portas locais** deslocadas +100 em relação ao imovil (que usa 3003 e 54320–54329), pra os dois stacks rodarem lado a lado: API 54421, DB 54422, Studio 54423, inbucket 54424, analytics 54427, pooler 54429, shadow 54420.

## Backend (Supabase)

- **Banco (Postgres)** só no servidor. No app, importe via `@/lib/db` (`server-only`, re-exporta `@/db`); `@/db` direto só em scripts, `e2e/` e testes. Tabelas com `.enableRLS()` e **sem policies** — o browser nunca lê/escreve o banco; toda escrita passa por server action (`src/app/actions/*`). Invariantes viram constraints nativas (`check`, `unique`, FK). Todo dado financeiro pertence a um usuário e toda query filtra pelo usuário da sessão.
- **Conexão**: `POSTGRES_URL` (pooler de transação, nome da integração Supabase ↔ Vercel). `fluxiDb` (`src/db/db.ts`) é o `createDrizzleDatabase` do `@cbrl/pg/drizzle` (`.db()`, `.ping()`, `.close()`, `.migrate()`): só modo password, CA do Supabase pinado, `sslmode` da URL removido. Erros do Postgres (`isUniqueViolation`, `pgErrorOf`) vêm do `@cbrl/pg`. `truncateFluxiTables` recusa host não-local.
- **Migrations**: `pnpm db:generate` gera em `drizzle/`; SQL custom (trigger em `auth.users`) via `drizzle-kit generate --custom`. Nunca `drizzle-kit push` em produção.
- **Tipos ↔ schema**: `camelCase` no TS, `snake_case` no Postgres; mudar uma tabela exige, no mesmo PR, `src/db/schema.ts` + migration nova + o mapeamento em `src/db/queries/*`. Dinheiro em centavos (inteiro), nunca float.
- **Auth** com `@cbrl/supabase` (sobre `@supabase/ssr`, sessão em cookie; clients `null` quando `NEXT_PUBLIC_SUPABASE_*` falta — o app degrada): `/client` no browser (só Auth), `/server` no servidor; `src/proxy.ts` refresca a sessão (`updateSession`); `getServerUser()` (`@/lib/auth/server.ts`) usa `getClaims()` dentro de `readBackend`. **Nunca** confiar em `getSession()` no servidor.
- **Login (Google, redirect)**: `/` mostra "Entrar com Google" (`useGoogleSignIn`, `@/hooks`) → Google → `/auth/callback` (`authCallbackRoute`) → `next` (same-origin, padrão `/painel`). `/painel` sem sessão redireciona pra `/?login=1&next=…` e o `AutoSignIn` dispara o login. O perfil (`profiles`) nasce do trigger `on_auth_user_created`. Login de teste do E2E: `/api/e2e-signin`.
- **Degradação**: leitura de backend no servidor passa por `readBackend` (`@/lib/backend-read`, timeout + fallback); backend fora → estado "Tentar de novo".

**Proibições:** `@/lib/db`, `@/db`, `@/lib/auth/server`, `@cbrl/supabase/server`, `@cbrl/log` em client components; acessar o banco pelo client do Supabase (PostgREST); chave secreta do Supabase no app (só existe no stack local, pra E2E/seed).

## Pacotes do toolkit (não recriar no app)

Design system, ferramental e infra comum (`@cbrl/{design,env,pg,supabase,next,log,br,tsconfig,eslint-config,prettier-config,commitlint-config,testing}`) vêm do npm (fonte: repo `kaycabral/toolkit`); mudança neles é feita lá e entra aqui por bump.

- **Logs**: `logger` do `@cbrl/log` (JSON, redação de PII), só Node. `no-console` é erro em `src/` (testes fora).
- **Next**: `next.config.ts` usa `@cbrl/next/config` (headers, CSP `report-only` → `/api/csp-report`); `/api/health` é `healthRoute`; `safeNext` do `@cbrl/next`.
- **BR**: `@cbrl/br/money` (centavos ↔ R$) e afins.
- **UI**: `ThemeProvider`, `Toaster`, `initials`, `cn` do `@cbrl/design`.
- **Testes**: `installJsdomPolyfills` (`vitest.setup.ts`), `defineE2EConfig`/`defineSmokeConfig` (Playwright), `readLocalSupabase`/`writeEnvLocal` (`@cbrl/supabase/local`).

## Não-óbvio

- **Deploy**: Vercel (Root Directory = raiz do repo; `vercel.json` com região `gru1` e cron diário em `/api/health`), Postgres/Auth no Supabase. Envs na Vercel: `POSTGRES_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. **Migrations em produção só pelo CI** (job `migrate-production` → `pnpm db:migrate`, no merge pra `main`); ninguém roda migrate contra prod da própria máquina. Toda migration é expand → contract e imutável depois do merge (o CI barra drift e edição). Runbook em [`docs/production.md`](docs/production.md).
- **Analytics**: `@vercel/analytics` só em produção, com URL redigida (`@/lib/web-analytics`): query e fragment nunca saem do browser; rota nova com id privado entra em `REDACTED_ROUTES`.
- **Testes**: `vitest.config.ts` (unit, jsdom; `src/db/*.test.ts` declaram `@vitest-environment node`; `src/db` fora da cobertura) e `vitest.pg.config.ts` (`src/db/**/*.pg.test.ts`, Postgres real, sem paralelismo). E2E: um usuário por worker (`e2e/fixtures.ts`, `test.use({ authAsUser: true })`).
- **Origem**: criado em 2026-11-24 a partir do baseline de infraestrutura do `imovil` (sem o domínio de imóveis).

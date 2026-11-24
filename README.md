# fluxi

Planejador de fluxo de caixa pessoal: cada pessoa entra com a conta Google e planeja entradas, saídas e saldo ao longo do tempo.

Um app Next.js na raiz do repo (sem workspaces), com Postgres e Auth no Supabase:

| Caminho              | Papel                                                          |
| -------------------- | -------------------------------------------------------------- |
| `src/`               | Next.js — landing com login (`/`) e área logada (`/painel`)    |
| `src/db`, `drizzle/` | Schema, migrations (Drizzle) e queries do Postgres no Supabase |

Design system e ferramental compartilhado vêm dos pacotes publicados do toolkit [`@cbrl/*`](https://github.com/kaycabral/toolkit) no npm.

## Rodando local

```bash
pnpm install
pnpm db:start   # stack Supabase local (Docker) + migrations
pnpm db:env     # grava .env.local
pnpm db:seed
pnpm dev        # http://localhost:3004
```

Regras de contribuição e gates em [`CLAUDE.md`](CLAUDE.md).

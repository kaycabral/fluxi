# Produção

Runbook do ambiente de produção do fluxi: o que roda onde, como mudança chega lá e o que fazer quando dá errado.

## Topologia

| Peça                   | Onde                                                                    |
| ---------------------- | ----------------------------------------------------------------------- |
| App (Next.js)          | Vercel, Root Directory na raiz do repo, domínio `fluxi-cbrl.vercel.app` |
| Postgres, Auth         | Supabase, região `sa-east-1` (São Paulo)                                |
| Funções (SSR, actions) | Vercel `gru1` (São Paulo), fixado em `vercel.json`                      |
| Login                  | Só Google (provider Google do Supabase Auth)                            |
| Migrations             | GitHub Actions, job `migrate-production` do `main.yml`                  |
| Sync bancário (Pluggy) | Supabase Edge Function `pluggy-sync`, diária via `pg_cron` + `pg_net`   |
| Deploy da função       | GitHub Actions, job `deploy-edge-functions` do `main.yml`               |

**Ninguém acessa o banco de produção da própria máquina.** Dev local roda inteiro no stack Supabase em Docker (`pnpm db:start`); a URL do banco de prod existe só no secret do GitHub e nas envs da Vercel.

## Fluxo de uma mudança

1. PR → `pull-request.yml`: roda `checks.yml` (format, lint, typecheck, higiene de migrations, unit, suíte Postgres + build contra o stack local, E2E) e o dependency review. O ruleset da `main` exige o check `CI passed` com a branch atualizada.
2. Merge na `main` → `main.yml`: o job `provenance` confirma pela API que a árvore do commit é idêntica à do head de um PR com `CI passed` verde. Confirmado, não re-roda nada; não confirmado (push direto via bypass, PR desatualizado), roda o pipeline completo antes. Então `migrate-production` (`pnpm db:migrate`) aplica as migrations pendentes em prod (no-op quando não há). Commit não provado → `migrate-production` **falha** em vez de ser pulado (um check "skipped" passaria no Deployment Check da Vercel).
3. Vercel builda o mesmo commit e só promove pra produção depois do check `migrate-production` passar (Deployment Checks). O código novo nunca entra no ar antes do schema que ele usa.

## Regras de migration

- **Gerar, nunca escrever à mão o diff de schema**: `pnpm db:generate`. SQL fora do Drizzle (trigger em `auth.users`) via `drizzle-kit generate --custom`.
- **Imutáveis depois do merge.** Errou? Nova migration corrigindo (fix forward). O CI bloqueia edição/rename/remoção.
- **Expand → contract.** Durante o deploy, a versão anterior do app roda contra o schema novo. Toda migration precisa ser compatível com o código que está no ar:
  - adicionar coluna: nullable ou com default;
  - renomear/remover coluna ou tabela: (1) PR que adiciona o novo e para de usar o antigo, (2) PR seguinte remove o antigo;
  - `NOT NULL` em coluna existente: backfill numa migration, constraint em outra.
- **Nunca `drizzle-kit push`** em prod.

## Rollback

- **App**: Vercel → Deployments → deploy anterior → _Instant Rollback_. Seguro por causa do expand → contract.
- **Schema**: não há down migration. Corrige com migration nova via PR. Em incidente com perda de dado: Supabase → Database → Backups (point-in-time depende do plano).
- **Migration falhou no CI**: o Drizzle aplica todas as pendentes numa única transação, então nada fica pela metade (consequência: nada de `CREATE INDEX CONCURRENTLY`, que não roda em transação). A Vercel não promove o deploy (check vermelho). Corrigir com PR e mergear.

## Configuração (uma vez)

### GitHub

- Ruleset `protect-main`: toda mudança via PR, com o check `CI passed` obrigatório e a branch atualizada (é o que permite ao `provenance` não re-rodar os checks na `main`).
- Environment `production`, restrito à branch `main`.
- Secret do environment `POSTGRES_URL_NON_POOLING`: connection string do **session pooler** (porta 5432) do Supabase — `postgresql://postgres.<ref>:<senha>@aws-<n>-sa-east-1.pooler.supabase.com:5432/postgres`. O host direto `db.<ref>.supabase.co` é só IPv6 e os runners do GitHub não alcançam; o pooler de transação (6543) não suporta o advisory lock do migrator.

### Vercel

- Envs de Production (a integração Supabase ↔ Vercel injeta as três primeiras): `POSTGRES_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- **Nunca** `ENABLE_TEST_AUTH` em Production/Preview.
- Settings → Deployment Checks: exigir o check `migrate-production` antes de promover pra produção.
- Deployment Protection (Vercel Authentication) só em Preview; o domínio de produção é público.

### Supabase Auth

- Site URL: `https://fluxi-cbrl.vercel.app`.
- Redirect URLs: `https://fluxi-cbrl.vercel.app/**` e o padrão dos previews da Vercel.
- Providers: Google ligado; Email desligado.
- Google Cloud: projeto próprio `fluxi`, OAuth client _Web_ `fluxi-supabase-production` (origin `https://fluxi-cbrl.vercel.app`; redirect URI `https://<ref>.supabase.co/auth/v1/callback`).
- O app OAuth está **em produção** (publicado sem verificação: só escopos básicos, sem logotipo, menos de 10 domínios). Branding com página inicial `https://fluxi-cbrl.vercel.app`, política `/privacidade` e termos `/termos`. Adicionar logotipo ou escopos sensíveis passa a exigir a verificação do Google.

## Sync bancário (Pluggy → `bank_feed_*`)

A sincronização roda **dentro do Supabase**, na Edge Function `pluggy-sync` (`supabase/functions/pluggy-sync`, lógica em `src/features/bank-feed/adapters/sync.ts`). Decisão de segurança: os dados ficam no processador que já os guarda (LGPD), o segredo da Pluggy vive num componente com superfície mínima, o banco é acessado pelo papel `fluxi_sync` (só `SELECT/INSERT/UPDATE/DELETE` em `bank_feed_accounts` e `bank_transactions` e `SELECT/INSERT/UPDATE` em `bank_feed_items`, via policies próprias; sem `auth`, sem outras tabelas) e não há superfície pública nova: a função tem `verify_jwt = false` mas responde 401 a qualquer chamada sem o header `x-fluxi-sync-token` (comparação em tempo constante).

- **Espaços**: cada item configurado em `PLUGGY_ITEM_IDS` é registrado em `bank_feed_items` e só é sincronizado depois que o usuário escolhe o espaço dele em Configurações → Conexões (menu da conta no painel) (item novo sai como `unassigned` no resumo, sem gravar nada). Os itens que já tinham dados antes da migration `0016_spaces` foram atribuídos ao espaço Pessoal. O módulo da função mudou junto com o schema: depois do merge de `0016`–`0018`, a função **precisa** ser reimplantada (o job `deploy-edge-functions` faz isso; sem o PAT, deploy manual), senão o sync antigo tenta gravar sem `space_id` e falha.
- **Agenda**: job `pluggy-sync-daily` do `pg_cron` (migration `0015_sync_schedule`), `0 9 * * *` UTC = 06:00 em São Paulo. Lê a URL e o token do Vault (`pluggy_sync_url`, `pluggy_sync_token`) e chama a função com `net.http_post` (timeout 150 s, o limite de inatividade da função).
- **Saída**: JSON só com agregados (por conta: transações, pendentes, removidas, intervalo de datas; itens pulados com o status). Logs idem: nunca credenciais, descrições ou valores.
- **Deploy**: job `deploy-edge-functions`, depois do `migrate-production`, com o CLI fixado do `package.json` (`supabase functions deploy pluggy-sync --use-api`). Sem o secret `SUPABASE_ACCESS_TOKEN` (PAT com escopo, passo 2) no environment `production`, o job só avisa e não faz deploy: aí o deploy é manual, de uma máquina logada no projeto, `pnpm exec supabase functions deploy pluggy-sync --workdir . --project-ref <ref> --use-api`. A variable `SUPABASE_PROJECT_REF` já está cadastrada.

### Configuração (uma vez, nesta ordem)

Tudo pelo Dashboard ou pelo CLI com o login do operador; nada de conexão ao banco de prod da máquina. Nenhum valor abaixo entra no git, em issue ou em chat.

1. **Pluggy**: no dashboard da Pluggy, **regenere o client secret** da aplicação de produção (o antigo deixa de valer; não guarde cópia). Anote client id, secret novo e os item ids (separados por vírgula). A aplicação DEMO (`~/.config/fluxi/pluggy.env`) é só do ambiente local.
2. **PAT do CI**: em Account → Access Tokens, crie um token **com escopo** (scoped) restrito ao projeto fluxi, com `edge_functions_write`, `edge_functions_read` e `projects_read` (os escopos que `supabase functions deploy --help` lista; nada além) e validade curta. GitHub → environment `production`: secret `SUPABASE_ACCESS_TOKEN` = o token; variable `SUPABASE_PROJECT_REF` = o ref do projeto.
3. **Secrets da função** (shell do operador, `pnpm exec supabase login` antes):

   ```bash
   umask 077; f=$(mktemp)
   PW=$(openssl rand -hex 32); TOKEN=$(openssl rand -hex 32); HOLDER=$(openssl rand -hex 32)
   cat > "$f" <<EOF
   PLUGGY_CLIENT_ID=<client id>
   PLUGGY_CLIENT_SECRET=<secret regenerado no passo 1>
   PLUGGY_ITEM_IDS=<item id>,<item id>
   FLUXI_SYNC_USER_ID=<UID do usuário em Authentication → Users>
   FLUXI_SYNC_DB_URL=postgresql://fluxi_sync.<ref>:$PW@aws-<n>-sa-east-1.pooler.supabase.com:6543/postgres
   FLUXI_SYNC_TOKEN=$TOKEN
   FLUXI_HOLDER_KEY_SECRET=$HOLDER
   EOF
   pnpm exec supabase secrets set --remote=<ref> --env-file "$f"
   printf %s "$PW" | pnpm -s scram:verifier   # copie a linha SCRAM-SHA-256$... (passo 4)
   printf %s "$TOKEN"                         # copie pro Vault (passo 5)
   shred -u "$f"; unset PW TOKEN HOLDER
   ```

   `FLUXI_HOLDER_KEY_SECRET` é a chave do HMAC que guarda o `holder_key` das contas de empresa (CNPJ nunca é gravado; só o tipo do titular e esse hash). Sem ele o sync funciona, mas loga um aviso e não reconhece "mesma empresa" entre conexões. **Não rotacione** sem necessidade: chave nova = hashes novos (as conexões já atribuídas não mudam, mas o roteamento automático de uma nova conexão da mesma empresa só volta a funcionar depois que as antigas sincronizarem de novo com a chave nova). Pra adicionar num ambiente existente: `pnpm exec supabase secrets set --remote=<ref> FLUXI_HOLDER_KEY_SECRET=$(openssl rand -hex 32)` (por arquivo, como acima, pra não ficar no histórico do shell) e redeploy da função.

   O pooler de transação (6543) com usuário `<papel>.<ref>` é o formato do Supavisor pra papéis próprios; a função conecta com `prepare: false`.

4. **Login do `fluxi_sync`** (SQL Editor): `alter role fluxi_sync login password 'SCRAM-SHA-256$...';` com o verificador do passo 3. Só o verificador passa pelo servidor e pelo histórico do editor, nunca a senha.
5. **Vault** (Integrations → Vault → Add secret, pela UI, não por SQL): `pluggy_sync_url` = `https://<ref>.supabase.co/functions/v1/pluggy-sync`; `pluggy_sync_token` = o token do passo 3.
6. **Primeira execução manual** (SQL Editor), depois do deploy da função pelo CI:

   ```sql
   do $$ begin execute (select command from cron.job where jobname = 'pluggy-sync-daily'); end $$;
   -- alguns segundos depois:
   select status_code, timed_out, error_msg, left(content, 500)
   from net._http_response order by id desc limit 1;
   ```

   `200` com `"ok": true` = sincronizou; `401` = token do Vault ≠ `FLUXI_SYNC_TOKEN`; `500` = veja os logs em Edge Functions → `pluggy-sync` → Logs (só agregados e o motivo). Execuções agendadas: `select * from cron.job_run_details order by start_time desc limit 5;`.

**Rotação**: token → gere outro, `supabase secrets set FLUXI_SYNC_TOKEN=...` (vale sem redeploy) e atualize o Vault; senha do `fluxi_sync` → passos 3 (só `FLUXI_SYNC_DB_URL`) e 4; Pluggy → regenere e `supabase secrets set PLUGGY_CLIENT_SECRET=...`. **Ressalva conhecida**: enquanto a requisição do `pg_net` está na fila, o token aparece decifrado em `net.http_request_queue`; por isso ele só serve pra disparar o sync (não é uma chave do Supabase).

## Integração do feed bancário ao ledger

O sync (`pluggy-sync`) chama `private.materialize_bank_feed(user, space, today)` depois de gravar o feed de cada espaço, e o app chama a mesma função ao mapear uma conta em Configurações → Conexões: cada transação de uma conta do feed **mapeada** (`bank_feed_accounts.account_id`) vira um lançamento avulso pago, ligado pela `bank_entry_links` (transferências entre contas mapeadas viram uma transferência só), e o saldo inicial das contas mapeadas é ancorado no saldo do banco. Nas contas conectadas, o planejado até hoje deixa de contar (o passado é o do banco). Nenhum dado existente é apagado. A função roda como `SECURITY DEFINER` num schema não exposto (`private`); executam só o dono (`postgres`, o papel do app) e o `fluxi_sync`.

O código não usa mais `count_from_month`: o saldo de cada conta começa no `opening_balance_cents` e soma todos os lançamentos. A coluna `user_settings.count_from_month` continua no schema (marcada como obsoleta) e **só é removida num PR seguinte** (expand → contract), depois deste estar no ar.

Ordem em produção:

1. **Merge e deploy**: `migrate-production` (migrations `0019`–`0021`) e a Vercel promove o app.
2. **Reimplantar a função** `pluggy-sync` (job `deploy-edge-functions`; sem o PAT, deploy manual): o módulo novo chama o materializador.
3. **Mapear as contas pelo app**: Configurações → Conexões, em cada conta do banco escolher "Conta no Fluxi" (uma existente do mesmo tipo ou "Criar conta"). Mapear já materializa e ancora o espaço. Contas antigas que não serão mais usadas: Configurações → Contas → Arquivar.
4. **Sync**: o diário faz o resto; pra rodar na hora, dispare o job (`do $$ begin execute (select command from cron.job where jobname = 'pluggy-sync-daily'); end $$;`) e confira `ledger` no resumo.

Regras: o banco é dono de valor, data, conta, tipo, repetição e "Pago" (re-sincronizados; o app recusa mudar ou excluir esses lançamentos); o usuário, de descrição, categoria, grupo e tags. Transação que o banco removeu (janela de 360 dias) apaga o lançamento. Desmapear ou trocar a conta apaga o que aquela conta do feed materializou e deixa de ancorar a conta antiga (o saldo inicial dela fica como está). Cartão: uma conta de cartão da Pluggy agrega todos os cartões (físicos e virtuais) que dividem o mesmo limite, então todas as transações caem na mesma conta do feed e mapeiam pra UMA conta de crédito do Fluxi; o feed reporta a fatura como positiva (devida) e o ledger guarda dívida negativa, então a âncora é `-balance_cents`.

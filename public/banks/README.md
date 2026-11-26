# Bank logos

Official connector icons published by [Pluggy](https://pluggy.ai) (`https://cdn.pluggy.ai/assets/connector-icons/<connector id>.svg`), downloaded once and served from here only to identify each institution next to its name. The app never loads them from the Pluggy CDN at runtime: that would tell a third party which banks a user has (and break the CSP).

The trademarks belong to their institutions. The mapping from bank names to these files lives in `src/features/bank-feed/core/logo.ts`.

| File                  | Connector                     |
| --------------------- | ----------------------------- |
| `banco-do-brasil.svg` | 611 Banco do Brasil           |
| `banrisul.svg`        | 659 Banrisul                  |
| `bradesco.svg`        | 603 Bradesco                  |
| `btg-empresas.svg`    | 655 BTG Pactual Empresas      |
| `btg-pactual.svg`     | 214 BTG Pactual               |
| `c6.svg`              | 626 C6 Bank                   |
| `caixa.svg`           | 619 Caixa Econômica Federal   |
| `itau.svg`            | 601 Itaú (also Itaú Empresas) |
| `mercado-pago.svg`    | 606 Mercado Pago              |
| `neon.svg`            | 689 Neon                      |
| `nubank.svg`          | 612 Nubank (also Nu Empresas) |
| `pagbank.svg`         | 692 PagBank                   |
| `picpay.svg`          | 651 PicPay                    |
| `safra.svg`           | 629 Safra                     |
| `santander.svg`       | 608 Santander                 |
| `sicredi.svg`         | 661 Sicredi                   |
| `xp.svg`              | 602 XP                        |

Adding one: download the connector's icon, check it has no `<script>`, `<foreignObject>`, event handlers or external references (the `logo.test.ts` suite checks every file here), and add its slug to `BANK_LOGOS`.

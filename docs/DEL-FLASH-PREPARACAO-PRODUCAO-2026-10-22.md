# Preparação para produção — 22/10/2026

Somente leituras e verificações locais. Nenhuma variável, conexão, migração, registro, permissão ou deploy de produção foi alterado.

## Git

- Branch `claude/compassionate-pasteur-n9uahi` em `4708963` (+ este documento). `main` em `5b2f01c`, ancestral direto: a integração é fast-forward, sem conflitos.
- Local: `tsc` aprovado, `npm test` 243/243, `next build` aprovado, `prisma validate` aprovado (com variáveis de banco definidas).

## Vercel

- Equipe `lp070087-5894s-projects`, projeto `adega` (`prj_1hBTgKW8uOKXkEorxy3gns16sht1`), domínio `adega-nine.vercel.app`, branch de produção `main`.
- Production atual: `5b2f01c` (deployment `dpl_GFR3AzRH6HoRFmmAr1a6gjAwykUf`, READY).
- Preview da branch `4708963`: build READY (`dpl_Dt151pbtkc3XPTED2ewufLYugDbS`).
- Variáveis existentes (todas **somente Production**, tipo sensitive, valor ilegível): `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_URL`, `NEXTAUTH_URL`, `TOKEN_ENCRYPTION_KEY`.
- Preview e Development **não têm nenhuma variável**: uma preview não acessa banco algum (impossível testar fluxos reais nela, e também impossível tocar a produção por ela).
- **Ausentes em Production:** `RESEND_API_KEY`, `MAIL_FROM`, `APP_PUBLIC_URL`, `DRIVER_APPLICATIONS_ENABLED`. `CUSTOMER_PORTAL_ENABLED` também ausente (com o código novo isso significa "ligado quando as tabelas existirem").
- Nenhuma integração Neon instalada na Vercel (as variáveis foram cadastradas manualmente).

## Neon — alvo de produção (CONFIRMADO por leitura)

- Logs de runtime da Vercel (produção, 21/10) mostram `DATABASE_URL` no host `ep-rough-mouse-aciez5ad-pooler.sa-east-1.aws.neon.tech`; a variável não mudou desde a criação.
- No Neon, esse compute pertence ao projeto **`delivery-platform`** (`square-sea-87088302`), branch **`production`** (`br-royal-dust-ac3fp5wz`, padrão), banco **`neondb`**, PostgreSQL 18, São Paulo.
- O projeto Neon "Del flash" (`sweet-cloud-90184757`, endpoint `ep-icy-star-b6vlbxdc`, criado em 21/10, praticamente sem uso) **não** é o banco de produção.
- `DIRECT_URL`: valor ilegível na Vercel; o host direto esperado é `ep-rough-mouse-aciez5ad.sa-east-1.aws.neon.tech`. Confirmar visualmente antes de migrar (o `prisma db execute` usa `DIRECT_URL`).
- Leitura (somente SELECT): 1 estabelecimento, 3 entregadores, 0 pedidos. `_prisma_migrations` existe e está **vazia** (banco criado por `db push`).
- Estado das migrações: nenhuma das cinco aplicada (`CustomerPortal*`, `DriverApplication*`, `DriverRegistrationLink`, `Platform*`, `Assistant*` inexistentes; `Driver_userId_key` presente).
- Backup: **nenhum snapshot e nenhum agendamento**. Só o histórico PITR de 6 h do projeto. Não há ponto de restauração durável.

## Migrações

| Migração | Cria/altera | Depende de | Necessária para |
|---|---|---|---|
| `20261019180000_platform_commercial` | 6 tabelas Platform*/SaaSCharge | Organization, User, Plan | Administração central (fora destas 3 áreas) |
| `20261020090000_assistant` | 3 tabelas Assistant* | Organization | WhatsApp/IA (fora destas 3 áreas) |
| `20261021180000_customer_portal` | 5 tabelas CustomerPortal* | Organization, Order | Área do cliente |
| `20261021210000_driver_applications` | 3 tabelas Driver*Link/Application* + troca do índice único de `Driver.userId` por `(organizationId,userId)` | Organization, User, Driver | Solicitação/vínculo de entregadores, múltiplas lojas |
| `20261022120000_customer_portal_terms` | coluna `termsAcceptedAt` | `customer_portal` | Área do cliente |

Confirmado por leitura em 22/10: nenhuma aplicada em produção. As três necessárias foram validadas em Postgres 16 isolado (resultado idêntico ao `schema.prisma`).

## Plano seguro (executar somente após autorização explícita)

1. **Alvo** já confirmado (`square-sea-87088302` / `br-royal-dust-ac3fp5wz` / `neondb`). Conferir que `DIRECT_URL` usa `ep-rough-mouse-aciez5ad` sem `-pooler`, ou executar o SQL pela ferramenta Neon diretamente nesse branch.
2. **Ponto de restauração durável**: criar snapshot (ou branch a partir do estado atual) desse branch e anotar o horário. Confirmar que a janela PITR cobre a intervenção.
3. **Leitura prévia (somente SELECT)** no alvo:
   - `SELECT to_regclass('public."CustomerPortalAccount"'), to_regclass('public."DriverApplication"'), to_regclass('public."DriverRegistrationLink"'), to_regclass('public."Driver_userId_key"'), to_regclass('public."Driver_organizationId_userId_key"');` — esperado: nulos, exceto `Driver_userId_key`.
   - `SELECT to_regclass('public."_prisma_migrations"');` — define se o histórico Prisma será registrado.
4. **Aplicar, em ordem, um arquivo por vez** (cada um tem BEGIN/COMMIT; erro desfaz tudo), na pasta `web`, com as variáveis do alvo confirmado:
   1. `npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20261021180000_customer_portal/migration.sql`
   2. `npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20261022120000_customer_portal_terms/migration.sql`
   3. `npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20261021210000_driver_applications/migration.sql`
   Conferir tabelas/índices após cada um. **Não** usar `migrate deploy` (aplicaria também platform_commercial e assistant).
5. `_prisma_migrations` existe vazia: registrar as três com `npx prisma migrate resolve --applied <nome>` (opcional, só rastreabilidade; não registrar platform_commercial/assistant).
6. **Variáveis (Production)**, após autorização: `RESEND_API_KEY`, `MAIL_FROM` (remetente de domínio verificado no Resend), `APP_PUBLIC_URL=https://adega-nine.vercel.app`, `DRIVER_APPLICATIONS_ENABLED=true`. Não criar `CUSTOMER_PORTAL_ENABLED`.
7. **Publicar**: fast-forward da `main` para a branch; aguardar deployment READY.
8. **Testes reais** com contas autorizadas por você.

### Recuperação

- Falha durante um arquivo: a transação é desfeita; nada a reverter.
- Problema após publicar: `CUSTOMER_PORTAL_ENABLED=false` desliga a área do cliente; remover `DRIVER_APPLICATIONS_ENABLED` desliga as solicitações; ou promover o deployment anterior (`dpl_GFR3AzRH6HoRFmmAr1a6gjAwykUf`). Tabelas novas ficam preservadas (não usar DROP).
- Índice do entregador: reverter só é possível se nenhum usuário tiver sido vinculado a duas lojas (`CREATE UNIQUE INDEX "Driver_userId_key" ON "Driver"("userId"); DROP INDEX "Driver_organizationId_userId_key";`).
- Último recurso: restaurar do snapshot/PITR, sabendo que dados gravados depois do ponto seriam perdidos.

## E-mails

- Implementados com envio real pelo Resend: confirmação de e-mail e recuperação de senha do cliente; confirmação da solicitação do entregador; ativação e recuperação de senha do entregador.
- **Não implementado:** e-mail avisando aprovação/rejeição do entregador (o resultado aparece no app do entregador).
- Sem `RESEND_API_KEY`/`MAIL_FROM`/`APP_PUBLIC_URL` em Production, nenhum e-mail é enviado; as telas informam a indisponibilidade. Nenhum envio foi feito nesta verificação.

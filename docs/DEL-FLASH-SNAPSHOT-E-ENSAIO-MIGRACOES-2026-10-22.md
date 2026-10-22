# Snapshot de produção e ensaio das migrações — 22/10/2026

## Banco de produção confirmado
- Vercel `adega` (Production) → `DATABASE_URL` no endpoint `ep-rough-mouse-aciez5ad` (log de runtime; variáveis inalteradas desde a criação).
- Neon: projeto `delivery-platform` (`square-sea-87088302`), branch `production` (`br-royal-dust-ac3fp5wz`), banco `neondb`, PostgreSQL 18.
- Única loja no banco: `loja-0102` ("Loja 0102") — a mesma servida por adega-nine.vercel.app. O projeto "Del flash" não tem nenhuma tabela.

## Backup
- Snapshot manual `snap-rough-river-acoc714h` ("pre-migracao-cliente-entregador-2026-10-22"), 2026-10-22 20:05:57 UTC, sem expiração.
- Restauração comprovada: restaurado sem finalizar na branch `teste-restauracao-2026-10-22` (`br-frosty-wildflower-actgqflh`); contagens e hashes de usuários, produtos, entregadores e schema idênticos à produção. A produção não foi tocada.
- Plano Free: limite de 1 snapshot manual (já usado).

## Ensaio das migrações (somente na branch restaurada)
1. `20261021180000_customer_portal` — OK
2. `20261022120000_customer_portal_terms` — OK
3. `20261021210000_driver_applications` — OK
- Dados existentes inalterados; verificações de ativação do app (`portalReady`, `driverApplicationsReady`) verdadeiras; schema das tabelas novas idêntico ao gerado pelo Prisma (hash `a9690737…`, 471 colunas).

## Riscos avaliados
- Todas aditivas; única alteração em tabela existente: troca do índice único de `Driver.userId` por `(organizationId, userId)` (3 linhas, bloqueio de milissegundos; sem perda de dados).
- `DriverApplication`/`DriverRegistrationLink` usam `ON DELETE RESTRICT` para User/Organization: nenhum código exclui usuários ou lojas.
- Ao existirem as tabelas, a versão publicada ativa sozinha a área do cliente (cadastro com entrada direta, pois não há provedor de e-mail).
- Solicitações de entregador seguem desligadas até `DRIVER_APPLICATIONS_ENABLED=true`; o link da loja só aparece com `APP_PUBLIC_URL`.

## Recuperação
- Falha durante uma migração: a transação é desfeita.
- Problema no app depois: `CUSTOMER_PORTAL_ENABLED=false` (desliga a área do cliente) ou promover o deploy anterior.
- Último recurso: restauração em uma etapa do snapshot sobre `production` (mantém a URL de conexão; perde o que for gravado depois do snapshot).

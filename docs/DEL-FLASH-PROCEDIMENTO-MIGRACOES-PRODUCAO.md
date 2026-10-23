# Procedimento seguro — 5 migrações pendentes na produção

**Status: NÃO executado. Aguarda autorização específica do responsável.**

Alvo: Neon `delivery-platform` (`square-sea-87088302`), branch `production` (`br-royal-dust-ac3fp5wz`), banco `neondb`.
Backup existente: snapshot `snap-rough-river-acoc714h` (22/10/2026, sem expiração; restauração já comprovada).

## As migrações (em `web/prisma/migrations`, nesta ordem)

| # | Migração | O que faz | Libera |
|---|---|---|---|
| 1 | `20261019180000_platform_commercial` | Cria 6 tabelas da plataforma (operadores, contratos, cobranças, auditoria, configurações, suporte) | Console da plataforma (/admin), cobrança SaaS |
| 2 | `20261020090000_assistant` | Cria 3 tabelas do atendimento WhatsApp (canal, conversas, mensagens) | Atendimento com IA (ainda exige credenciais, ver abaixo) |
| 3 | `20261021180000_customer_portal` | Cria 5 tabelas da conta do cliente | Cadastro/login do cliente, endereços, histórico |
| 4 | `20261022120000_customer_portal_terms` | Coluna `termsAcceptedAt` na conta do cliente | Registro do aceite dos termos |
| 5 | `20261023090000_driver_multistore` | Troca o índice único `Driver_userId_key` por `(organizationId, userId)` | Mesmo entregador em várias lojas |

Todas são aditivas. A única alteração em tabela existente é a troca de índice da #5 (3 linhas hoje; sem perda de dados). Não há dependência de dados entre elas além da ordem: a #2 exige `Organization`; a #4 exige a #3; a #1 exige `Plan`, `User` e `Organization`, que já existem.

## Ensaio realizado

Branch isolado `teste-migracao-entregadores-2026-10-23` (`br-rough-band-aclh72na`), criado a partir da produção em 23/10/2026. As 5 aplicadas em uma única transação, sem erro. Antes e depois: 4 usuários, 3 entregadores, 3 vinculados a conta, 2 aguardando primeiro acesso, 0 pedidos; índices de `Driver` conforme esperado.

## Procedimento (quando autorizado)

1. Conferir que a produção ainda é o alvo: `SELECT current_database(), count(*) FROM "Organization";` no branch `br-royal-dust-ac3fp5wz`.
2. Confirmar o snapshot `snap-rough-river-acoc714h` (plano Free: 1 snapshot manual; não criar outro sem apagar este).
3. Executar as 5 migrações **em uma única transação**, na ordem acima (é o mesmo conjunto de comandos do ensaio).
4. Registrar no Prisma: `prisma migrate resolve --applied <nome>` para cada uma (não usar `migrate deploy` sem antes conferir `_prisma_migrations`, porque o banco foi criado sem histórico).
5. Verificar: mesmas contagens do passo 1; `SELECT indexname FROM pg_indexes WHERE tablename='Driver'` contém `Driver_organizationId_userId_key` e não contém `Driver_userId_key`.
6. Abrir `/app/entregadores`, `/loja/<slug>/conta/entrar` e `/entregador/` em produção.

## O que muda sozinho depois das migrações

- A área do cliente passa a ficar disponível (a versão publicada detecta as tabelas). Sem provedor de e-mail, o cadastro funciona sem confirmação por e-mail e "Esqueci minha senha" mostra aviso de configuração pendente. Para desligar: `CUSTOMER_PORTAL_ENABLED=false` na Vercel.
- Multiloja do entregador passa a funcionar.
- Atendimento com IA continua desligado até `WHATSAPP_ASSISTANT_ENABLED=true` + credenciais.
- Console da plataforma exige cadastrar um `PlatformOperator` (alteração de permissão administrativa: só com autorização).

## Reversão

- Erro durante a execução: a transação é desfeita inteira.
- Problema no app depois: `CUSTOMER_PORTAL_ENABLED=false` ou promover o deploy anterior na Vercel.
- Último recurso: restaurar o snapshot sobre `production` (perde o que for gravado depois de 22/10/2026 20:05 UTC).

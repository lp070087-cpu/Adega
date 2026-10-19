# Administração central e comercial — ativação controlada

Implementação de código em 19/10/2026. Nenhuma migração, concessão global, cobrança real ou mudança de dados de produção foi executada.

## Situação de publicação

As rotas `/admin` e `/admin/login` permanecem fechadas enquanto `PLATFORM_ADMIN_ENABLED` não for exatamente `true`. Se a flag for ativada antes de existirem todas as tabelas novas, a autorização falha fechada. Uma conta proprietária de estabelecimento, inclusive com o papel legado `PLATFORM_ADMIN`, não recebe acesso global por esse motivo. O cadastro e onboarding não criam `PlatformOperator`.

## Aprovações necessárias

1. Aprovar a aplicação da estrutura nova no banco escolhido, após backup e ensaio em banco isolado. Arquivo: `web/prisma/migrations/20261019180000_platform_commercial/migration.sql`.
2. Aprovar explicitamente o `User.id` existente que receberá a primeira autorização global `OWNER`. Identificar a conta por ID e conferir titularidade; não selecionar apenas por e-mail de uma variável de ambiente. Não criar outra conta ou senha para contornar o processo.
3. Aprovar a ativação da flag `PLATFORM_ADMIN_ENABLED=true` no ambiente desejado.
4. O bloqueio comercial requer aprovação operacional separada: `PLATFORM_BILLING_ENFORCEMENT_ENABLED=true` e `enforceAccess=true` no contrato escolhido. Os padrões são desabilitados. Não ativar indiscriminadamente nas organizações existentes.

## Migração

A migração cria seis tabelas novas: PlatformOperator, PlatformContract, SaaSCharge, PlatformAudit, PlatformSetting e PlatformSupportCase. Cria índices únicos, relações com exclusão restrita e restrições de estado, valor, datas e pagamento. Não altera colunas, enums ou registros legados. O vínculo composto de cobrança ao contrato impede mistura de organização. O SQL é envolvido em BEGIN/COMMIT para aplicação atômica.

Este repositório anteriormente usava arquivos SQL sem histórico Prisma de migrations. Não executar `prisma migrate deploy` cegamente num banco preexistente: pode exigir baseline e produzir P3005. Após a aprovação, um responsável pode revisar e aplicar o arquivo SQL explicitamente (`prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20261019180000_platform_commercial/migration.sql`, executado em `web/` com conexão confirmada), ou estabelecer uma baseline auditada antes de adotar o fluxo de migrations. A escolha e execução pertencem à janela aprovada. Nunca aplicar automaticamente no build ou postinstall.

Antes da aplicação: confirmar nomes de tabelas existentes, backup recuperável, ausência das tabelas novas e compatibilidade com o banco. Depois: conferir seis tabelas, índices, FKs e CHECKs. Nenhum seed ou conversão automática é necessário. Em caso de falha, manter flags desligadas. Não apagar tabelas financeiras para desfazer uma ativação com dados; desligar flags e preparar correção aditiva.

## Primeiro operador

### Conta indicada e procedimento preparado em 19/10/2026

Consulta somente de leitura confirmou uma única conta ativa `lp070087@gmail.com`, com `User.id` `cmu0pypp60000jm9opt2k0l7j`. As seis tabelas novas estavam ausentes: nenhum conflito de nomes foi encontrado nessa consulta. Não foi concedido privilégio. A indicação da conta não é autorização para aplicar a migração, que continua aguardando aprovação específica.

A consulta do histórico confirmou que `_prisma_migrations` existe, mas está vazia.
Isso não representa uma baseline aplicada; o schema legado deve ser preservado
e o procedimento de aplicação SQL explícita acima continua necessário.

Na pasta `web/`, com a conexão do ambiente escolhido conferida e sem exibir seu conteúdo:

```powershell
# Somente leitura: pode ser repetido antes e depois da migração.
node --env-file=.env --import tsx scripts/platform-owner.ts

# SOMENTE após aprovação específica, backup recuperável e ensaio isolado:
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20261019180000_platform_commercial/migration.sql

# SOMENTE após migração e aprovação da concessão à conta/ID conferidos:
node --env-file=.env --import tsx scripts/platform-owner.ts --apply-approved --user-id cmu0pypp60000jm9opt2k0l7j --approval "REFERENCIA DA APROVACAO ESPECIFICA"
```

O script não aplica SQL nem cria usuário. No modo de concessão, exige todas as tabelas, conta ativa e ID correspondente, bloqueia bootstrap se houver outro OWNER ativo e grava concessão/auditoria na mesma transação serializável. Repetição após OWNER ativo retorna UNCHANGED e não duplica operador/auditoria. Um lock transacional coordena execuções simultâneas. Não imprimir nem versionar a conexão. Se a conta não existir ou mudar de identidade, corrigir o cadastro pelo processo normal, sem trocar o destinatário do script.

Após verificar a concessão, ativar apenas `PLATFORM_ADMIN_ENABLED=true` e publicar a configuração. Manter `PLATFORM_BILLING_ENFORCEMENT_ENABLED=false`. Validar login real e todas as seções de `/admin`; não executar esse teste concedendo privilégios sem aprovação.

### Impacto e recuperação

São criados seis conjuntos de dados novos, nove índices além das seis chaves primárias, sete FKs com ON DELETE RESTRICT e dez CHECKs. Todas as instruções ALTER TABLE se referem às tabelas novas. As tabelas User, Organization e Plan são apenas alvos de FK; nenhuma coluna ou linha delas é alterada. A migração não é repetível: se qualquer tabela já existir, interromper e reconciliar o estado, sem DROP ou IF NOT EXISTS que oculte divergência. Há dependência de PostgreSQL, tabelas legadas e permissões DDL adequadas. O histórico Prisma anterior deve ser conferido/baseline aprovado separadamente.

Recuperação: antes de executar, confirmar backup/restore ou ponto de recuperação Neon e ensaio em banco isolado. Falha dentro de BEGIN/COMMIT deve reverter a estrutura inteira; confirmar o estado antes de repetir. Após ativação, desligar a flag administrativa e conservar as tabelas/auditoria; não apagar dados para reverter. Incidente com dados requer restauração aprovada ou correção aditiva, com impacto nos dados posteriores avaliado pelo responsável.

Não há endpoint público de bootstrap. A primeira autorização exige intervenção explícita de responsável pelo banco, em transação:

- Conferir `User.id` aprovado, conta ativa e titularidade.
- Conferir ausência de OWNER ativo antes de um bootstrap inicial.
- Inserir PlatformOperator com ID único, userId aprovado, role OWNER, active true, createdAt/updatedAt.
- Inserir PlatformAudit na mesma transação, com operatorId recém-criado, action BOOTSTRAP_OPERATOR, resourceType PlatformOperator, resourceId, motivo da aprovação e data. Não incluir credenciais.
- Validar acesso em `/admin/login`. Novos operadores passam a ser geridos apenas por OWNER, com confirmação, motivo e auditoria. A aplicação impede remover o último OWNER ativo.

Nenhuma concessão foi realizada nesta execução. IDs concretos e o comando de concessão devem ser revisados após a aprovação do titular.

## Dados e regras

- Plan reutilizado: preço mensal e limites nas colunas originais; descrição e oferta anual em `features.commercial`; lista de recursos em `features.features`. Outros atributos JSON são preservados.
- PlatformContract contém um único contrato comercial atual por organização. Subscription legado é preservado e aparece como contexto anterior até a configuração explícita do contrato. Não são criadas assinaturas, testes, cobranças ou pagamentos automaticamente para lojas existentes.
- Valor contratado é snapshot. Alterar apenas situação ou vencimento preserva o valor. Trocar plano/periodicidade ou selecionar recálculo explícito adota a tarifa atual e registra valores anteriores e novos.
- Situação efetiva vencida é calculada com as datas. Nenhum job ou informação de tempo real é simulado. Renovar exige ajustar o vencimento. Recebimento não renova automaticamente.
- Cobrança copia valor e organização do contrato no servidor; competência única por contrato impede emissão duplicada. Não há processamento externo. Pagamento manual exige confirmação, data válida, motivo e auditoria. Uma cobrança recebida não pode ser recebida novamente nem cancelada como pendente. Somente pendentes podem ser canceladas.
- MRR usa contratos ativos e não vencidos, com valor anual distribuído em 12 meses. Receita recebida vem somente de cobranças PAID com paidAt no mês de São Paulo; pendentes não contam como receita recebida. Valores são separados dos caixas das lojas.
- OWNER/ADMIN acessam administração geral; FINANCE acessa comercial; SUPPORT acessa estabelecimentos, integrações e suporte, sem financeiro, contas ou auditoria. Alterações de operadores e configurações globais exigem OWNER.
- Integrações exibem estados existentes, contagem de credenciais protegidas e eventos sem payloads ou segredos. As configurações usam autorização central, confirmação e auditoria. Nenhum adapter externo foi implementado.
- A política comercial deve restringir somente NOVOS pedidos. Pedidos e entregas já em andamento continuam operáveis. Contratos sem enforceAccess e organizações sem contrato permanecem liberados.

## Validação desta frente

`tests/platform.test.ts` executa módulos reais de autorização, ações e métricas com dependências isoladas/mocks. Cobre acesso fechado, papel tenant insuficiente, conta/operador revogados, migração ausente, escopos, validação de valores e datas, MRR anual e recebidos, confirmação obrigatória, preço/organização server-side, duplicação de pagamento, preservação de snapshot, recálculo explícito, cancelamento de cobrança e data local de recebimento.

Esses testes não são E2E e não acessam Neon. Não validam a execução SQL em PostgreSQL, a autenticação real em sessão de navegador nem a persistência em produção. A liberação operacional depende da migração aprovada e testes isolados de banco/sessões. Typecheck/build e validação visual global são registrados no relatório principal.

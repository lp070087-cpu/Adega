# Operação comercial — caixa, plano único, campanhas e pontos (20/10/2026)

## Persistência e limites

Esta frente reutiliza tabelas existentes e Organization.settings, sem alterar schema ou aplicar SQL. Escritas operacionais são serializadas por bloqueio da organização na mesma transação PostgreSQL; configurações irmãs são preservadas. Nenhum dado de produção foi escrito para demonstrar funcionalidades. Settings não é localStorage.

- `cashHandoffs`: histórico de passagem de caixa, origem/destino, valores conferidos, diferença anterior, aceite/recusa e vínculos aos dois turnos.
- `growth.campaigns`: configuração validada, validade, condição, limites e situação.
- `growth.contacts`: contatos manuais efetivamente confirmados, com operador e data.
- `growth.consents`: preferência por cliente, escopo da loja e registro do responsável.
- `growth.uses`: reservas de benefícios por chave idempotente do checkout, com desconto e frete calculados no servidor.
- `growth.loyalty` e `growth.ledger`: regras, ativação temporal, créditos, estornos e resgates, separados das campanhas.

Limites conservadores: 100 campanhas; 10.000 contatos, utilizações, eventos de pontos e passagens. Histórico e chaves de idempotência nunca são truncados. Novos contatos/benefícios/resgates são recusados ao atingir o limite. Créditos de pontos acima do limite geram Notification determinística `loyalty-pending:ORDER_ID`, sem impedir a entrega e sem afirmar que os pontos foram creditados. Estornos continuam permitidos. Regularização do crédito pendente requer ampliação do armazenamento e procedimento revisado; não há reparação automática oculta.

A estratégia JSON é compatível com a estrutura atual e volume inicial. Uma evolução para tabelas específicas deverá preservar históricos e chaves e ser submetida à aprovação de schema antes de uso em escala. Não limpar históricos para liberar capacidade.

## Caixa

O operador responsável confere o dinheiro, encerra seu turno e escolhe outro usuário ativo da mesma organização com MANAGE_CASH. O servidor valida vínculo, operador, confirmação, valor e turno. A transferência pendente impede abertura avulsa no mesmo caixa. O destinatário faz nova contagem e aceita o saldo exato; abertura do novo turno, aceite e responsabilidade são persistidos atomicamente. Contagem divergente permite recusa com justificativa e valor conferido; nenhum turno novo é aberto silenciosamente. Aceite repetido não duplica turno.

O histórico identifica operadores anterior/novo, origem/destino, saldo proposto/contado, diferença no fechamento e observações. Pendências não devem ser deixadas abertas durante recebimento de dinheiro: entre encerramento e aceite não há turno ativo naquele caixa. Pedidos permanecem registrados e exigem conferência dos pagamentos desse intervalo, como já ocorre quando não existe caixa aberto. Não foi inventado lançamento automático retroativo.

Fechar turno de outro operador requer perfil de supervisão OWNER/ADMIN/MANAGER e justificativa. Transferência exige conferência do próprio responsável. Dinheiro físico é separado de Pix/cartões; estornos eletrônicos não reduzem a gaveta. Campos monetários mantêm strings durante edição, admitem apagar tudo e formatam em pt-BR ao perder foco; parsing/validação ocorre no envio.

## Oferta comercial

Fonte única de configuração: `src/lib/commercial-plan.ts` — Adega Completo, R$ 119,00/mês. Página comercial `/planos` e oferta na assinatura usam essa configuração. Contrato atual continua mostrando seu valor realmente contratado.

A ação central `publishPlan` precisa ser executada explicitamente por operador global autorizado, com confirmação, motivo e auditoria. Ela publica/atualiza o plano canônico e desativa outras ofertas, preservando preços antigos, contratos e cobranças. Não foi executada. Novas ofertas ativas alternativas são recusadas pelo servidor. Novas solicitações e associações usam o plano canônico; contratos legados mantêm seus snapshots. Nenhuma cobrança ou assinatura é criada pela página comercial.

## Campanhas

Rota `/app/campanhas`, permissão MANAGE_SETTINGS. Tipos: Turbo, desconto, cupom, frete grátis e comunicação personalizada. Validade, pedido mínimo, inatividade desde último pedido entregue, frequência, capacidade, limite por cliente e opt-out são revalidados no servidor.

`applyCampaignBenefit(tx, organizationId, customerId, subtotal, deliveryFee, couponCode, requestKey)` deve rodar na mesma transação de criação do pedido. Consulta cliente da organização, escolhe o melhor benefício elegível sem acumular campanhas, calcula desconto/frete e grava reserva idempotente. Cupom inválido não produz confirmação falsa. Se a transação do pedido falhar, sua reserva também é revertida. Preços e estoque continuam sob responsabilidade do checkout existente. Uso promocional e contatos manuais possuem contadores separados para evitar que um contato recém-realizado invalide a própria oferta.

A audiência operacional lista até 1.000 clientes e considera pedidos entregues. Não existe disparo externo ou envio em massa. Registrar contato exige confirmação explícita depois de realizá-lo no canal autorizado. Campanha personalizada é comunicação; não aplica desconto oculto. O helper de benefício é integrado pelo responsável pelo fluxo de pedidos, que também deve persistir e mostrar o desconto no pedido/recibo.

## Pontos

Rota `/app/fidelidade`, permissão MANAGE_SETTINGS. Padrão desativado. Ativação grava activatedAt. Apenas pedidos entregues após a ativação geram pontos, sobre total efetivo menos frete, com cálculo em centavos. `syncOrderLoyalty(tx, organizationId, orderId)` deve executar na mesma transação que altera o estado do pedido. Chaves `ORDER_ID:earn` e `ORDER_ID:reverse` impedem crédito/estorno repetidos. Cancelamento estorna crédito existente mesmo com programa posteriormente desativado. Após resgate anterior, um estorno pode deixar saldo negativo real; não há apagamento da dívida.

A recompensa e custo em pontos são configuráveis. O resgate registra entrega manual da recompensa, confirmado pelo operador; chave UUID impede débito duplicado e saldo insuficiente é recusado. Não foi criado desconto monetário fictício ou promessa de entrega automática da recompensa.

## Benefícios do consumidor

`/loja/[slug]/beneficios?pedido=ORDER_ID` usa o ID de pedido de alta entropia como capability, igual ao acesso ao recibo. Consulta obrigatoriamente pedido+slug+customerId, nunca telefone. Não expõe nome, telefone ou endereço. A página usa noindex/nofollow e política no-referrer. Programa desativado não mostra pontos/extrato. O cliente pode consultar saldo e benefícios elegíveis e alterar preferência de contato com a mesma capability; a ação revalida loja/pedido/cliente em transação. O responsável pela loja pública adiciona o link no recibo.

## Verificação

Testes isolados com mocks em `tests/growth-cash.test.ts`, `tests/platform.test.ts`, `tests/central-integrations.test.ts` e `scripts/operations.test.ts`; nenhum teste escreve no Neon. Cobrem cálculos, autorização, isolamento, aceite de caixa, idempotência de pontos/resgates/cupom, datas e limites, opt-out, preço único, snapshots comerciais, e acesso por capability sem telefone. Não equivalem a E2E, ensaio de concorrência PostgreSQL ou operação física de caixa. Typecheck/build e revisão visual são executados na frente principal e registrados no relatório consolidado.

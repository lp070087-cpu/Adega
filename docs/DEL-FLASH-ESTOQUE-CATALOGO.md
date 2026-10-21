# Estoque e catálogo — operação com prévia

Esta etapa não executou atualização de estoque, ativação de produto ou pedido no Neon.

## Vitrine

A consulta pública já retorna todos os produtos ativos da organização, sem corte por saldo ou limite de paginação. Produtos pausados ou sem estoque permanecem visíveis e com compra bloqueada pelas regras existentes. A expansão mobile por categoria continua no mesmo componente.

Foi corrigida uma omissão: produto ativo associado a uma categoria desativada era recebido do servidor, mas descartado no agrupamento da vitrine. Agora aparece em **Outros produtos**, sem duplicação. Estoque também deixou de limitar silenciosamente sua listagem aos primeiros 500 produtos controlados.

## Disponibilizar no catálogo

O módulo Estoque oferece **Disponibilizar no catálogo**. O operador seleciona cadastros existentes, confere saldo físico, mínimo, publicação, disponibilidade e controle de estoque. Nenhum produto é copiado ou criado.

A quantidade conferida é o próprio saldo físico usado no checkout; não representa um segundo estoque nem uma reserva independente. Alterar essa quantidade registra ajuste pelo valor da diferença, com saldo anterior, novo saldo, responsável e motivo. Desativar controle exige atenção: itens produzidos sob demanda podem ser vendidos sem limite de saldo, conforme o funcionamento já existente.

## Inicialização de 25 / mínimo 5

**Inicializar estoques · prévia 25/5** exige administração da loja e propõe, para cada produto selecionado elegível:

- Saldo: 25 unidades.
- Mínimo: 5 unidades.
- Publicado, disponível e com controle de estoque.

A prévia mostra nome e ID da organização, quantidade selecionada/elegível/preservada e cada saldo/mínimo/publicação anterior e proposto. O usuário precisa confirmar expressamente que conferiu os saldos físicos e autoriza aquela organização. Nenhuma execução é automática.

São preservados combos (que exigem revisão própria de componentes) e produtos presentes em pedidos em andamento, inclusive componentes de combos vendidos. Produto excluído ou de outra organização invalida a seleção. Produtos inativos só são ativados quando explicitamente selecionados e confirmados na prévia; nenhum registro excluído é recriado.

## Segurança e histórico

- Autorização de estoque e catálogo no servidor; inicialização padrão exige também administração da loja.
- Organização vem da sessão; não existe parâmetro cliente que escolha outra organização.
- Trava transacional existente por organização coordena publicação, ajuste e pedidos.
- Prévia tem impressão SHA-256 de valores e estado consultado. Se saldo, cadastro ou situação de pedidos mudar, a confirmação é recusada e exige nova revisão.
- Referência UUID de operação e impressão dos parâmetros tornam a confirmação idempotente; repetição não duplica ajuste nem notificação.
- Mudança real de saldo produz movimento; saldo inalterado não gera movimento fictício de quantidade zero. Configurações/publicação ficam no recibo auditado da operação.
- Histórico fica em `Organization.settings.stockPublicationOperations`, preservando as configurações existentes. Limite seguro: 100 produtos por lote e 200 operações; ao atingir o limite, o sistema recusa novos lotes e solicita suporte, sem apagar histórico. Evolução para tabela dedicada depende de migração futura aprovada.

As telas antigas de ajuste individual e inicialização conservadora de produtos zerados sem histórico continuam disponíveis. Não alteram dados históricos nem dispensam confirmação.

## Validação executada

Sete testes novos exercitam prévia sem gravação, confirmação auditada, repetição sem duplicidade, alteração concorrente invalidando prévia, exclusões, autorização, isolamento, valores inválidos e preservação de 650 produtos no agrupamento público. A disponibilidade exibida de combos agora considera o saldo físico e as quantidades de cada componente, além de pausa, inatividade e vínculo da organização. O checkout permanece a autoridade transacional final.

Os quatro testes existentes da inicialização conservadora também passaram. Não foi executado teste com escrita em produção.

## Prévia agregada por consulta de leitura

O script `web/scripts/preview-stock-publication.ts` não possui opção de aplicação nem chamadas de gravação. Confere a identidade ativa indicada, exige vínculo ativo OWNER da organização e usa uma transação RepeatableRead somente com consultas. Se houver mais de uma organização própria, exige `--organization-id ID`; não escolhe outra loja. Não imprime usuários, clientes, credenciais ou nomes dos produtos, apenas identificação pública da loja e agregados de saldos/ativação/exclusões.

Na pasta `web/`: `node --env-file=.env --import tsx scripts/preview-stock-publication.ts`. Se necessário: acrescentar `--organization-id ID_CONFERIDO`. Esse comando produz somente prévia e nunca autoriza a inicialização. Mesmo após aprovação, a aplicação exige nova prévia com impressão do estado atual e confirmação do lote.

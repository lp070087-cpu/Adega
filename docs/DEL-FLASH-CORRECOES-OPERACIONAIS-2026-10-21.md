# Del Flash — correções operacionais de 21/10/2026

Base preservada: `232b57d` e `a3f9cb9`, branch `main`. Nenhuma migração, concessão OWNER, inicialização de estoque, pedido, cobrança ou envio externo foi executado. Os nove prints mencionados no pedido não estavam disponíveis para inspeção nesta mensagem; a investigação usou os sintomas descritos, código e consultas somente de leitura.

## Causas e correções

| Problema | Causa verificada | Correção e limite |
|---|---|---|
| Estoque difícil de operar | Duas abas; reposição e saída no mesmo seletor, instruções sobre sinais; quantidade sem edição direta | Quatro abas Total / Estoque baixo / Movimentos / Saldo. Quantidade, mínimo, custo e preço editáveis com Salvar/Cancelar e motivo. Total inclui produtos sem controle, identificados; resumo usa apenas controlados. Reposição positiva; contagem absoluta; correção mostra anterior/proposta; histórico filtrável. |
| Sobrescrita de quantidade/valores | Contagem não conferia se o valor exibido ainda era atual; escritores do catálogo nem sempre compartilham o lock da organização | Contagem confere quantidade dentro da transação. Edição inline usa comparação atômica do valor anterior na gravação e da promoção vigente ao editar preço; disputa recusa a operação antes de movimento/auditoria. Permissão por campo e organização. Quantidade gera movimento real; demais alterações geram registro persistido em Notification, sem depender das tabelas centrais. Histórico individual filtrado pelo ID do produto, sem misturar nomes iguais. |
| Movimentos negativos com sinal incorreto | Interface deduzia sinal pelo tipo, embora ADJUSTMENT possa retirar | Sinal deriva da diferença real entre quantidade anterior e posterior. Baixa de vendas/cancelamentos e trava de repetição existentes preservadas. |
| “Fora da vitrine (sem estoque)” | Mensagem do catálogo contradizia a consulta pública, que já mantinha produtos ativos zerados | Rótulos “Na vitrine · aguardando reposição” e “Na vitrine · compra pausada”. Estoque zero não oculta; reposição libera capacidade sem republicação. Testes cobrem combos e isolamento. |
| Fotos ausentes | Catálogo não repassava imageUrl legado ao componente de miniaturas; acervo possui lacunas reais | Foto legada reaproveitada com prioridade consistente. Nenhuma marca/volume/embalagem aproximada foi atribuída. Inventário exato do acervo separado; fallback preservado. |
| Loja aberta no painel / fechada no site | Painel mostrava somente OPEN manual; vitrine/checkout também aplicavam agenda | Painel e menu usam a mesma função de estado efetivo. OPEN significa habilitada, seguindo horários; PAUSED/CLOSED bloqueiam novos pedidos. Seletor explica a regra e mostra fechamento pela agenda. Mudança revalida a loja pública. Horários existentes não foram alterados. Fuso Brasília/Recife. |
| Acesso do entregador com conta do proprietário | Mesma sessão do domínio, sem vínculo Driver; mensagem genérica | Orientação explícita para sair e usar conta individual. Convite pendente encaminhado somente após verificar no servidor identidade, vínculo DRIVER, organização e estado ativo. Nenhum proprietário recebeu papel de entregador. |
| Botões de instalação | InstallLink não reagia ao evento appinstalled; observações divergentes entre componentes | Observação compartilhada de standalone/minimal-ui/iOS e appinstalled, com limpeza de listeners. Aba comum não é tratada como aplicativo já instalado; instruções permanecem em Configurações. Testes em aparelhos físicos pendentes. |
| Navegação lenta | Estoque relia produtos três vezes para lista, totais e publicação; configuração aguardada sequencialmente | Uma leitura de produtos alimenta as três funções; configuração e movimentos em paralelo. Consulta de movimentos limitada a 100. Não foi alegada melhora percentual nem diagnóstico de consulta lenta sem medição autenticada. |
| Desktop pouco refinado | Hero, categorias, fotos e sacola mantinham proporções anteriores | Hero com composição/tipografia e botões maiores; contagem real por categoria; cards sem borda pesada, fotos proporcionais, preço destacado e sacola lateral compacta. Quatro colunas desktop/duas mobile e cor individual da Loja 0102 preservadas. Movimento reduzido respeitado. Revisão visual nova não concluída. |

## Prévia atualizada — não aplicada

Organização conferida: **Loja 0102**, ID `cmu1bc6nn0000jmzwcst095z8`, slug `loja-0102`.

- 89 produtos e 89 elegíveis na consulta; nenhum combo/pedido em andamento excluído naquele instante.
- **62 unidades atuais**: 87 produtos com zero, um com 12 e outro com 50. A prévia anterior de 12 unidades está superada.
- Proposta: 25 por produto, mínimo 5; **2.225 unidades depois**, diferença agregada **+2.163**. Inclui reduzir o produto com 50 para 25; não é apenas reposição.
- Nenhuma ativação/disponibilidade/controle adicional necessária naquela consulta.
- Arquivos locais `docs/DEL-FLASH-ESTOQUE-0102-PREVIA.md` (tabela para revisão) e `.json`: nome/ID por produto, quantidade anterior/proposta, diferença, mínimo anterior/proposto, exclusões e situação da fotografia. Arquivos ignorados no Git para não publicar inventário operacional detalhado.
- Fotos da loja: **24 com arquivo local correspondente disponível; 65 sem foto exata disponível**. Não há URL externa configurada nesses 65 na consulta. Lista por produto no arquivo local. Não foram criadas fotos ou modificadas referências no banco.

A operação existente de publicação/inicialização usa transação por organização, prévia com impressão do estado, referência idempotente, motivo/responsável e movimentos reais. É uma única operação para os 89 elegíveis (limite 100). Exige **confirmação específica desta nova prévia**, e nova conferência de pedidos/saldos imediatamente antes da aplicação. Nada foi aplicado.

## Admin Central

Consulta somente de leitura reconfirmou `lp070087@gmail.com` ativa, User.id `cmu0pypp60000jm9opt2k0l7j`. Continuam ausentes PlatformOperator, PlatformContract, SaaSCharge, PlatformAudit, PlatformSetting e PlatformSupportCase. O menu depende de autorização global válida no servidor, não de e-mail no navegador.

SQL aditivo e procedimento idempotente de concessão continuam preparados em `web/prisma/migrations/20261019180000_platform_commercial/migration.sql`, `web/scripts/platform-owner.ts` e `docs/ADMIN-COMERCIAL-ATIVACAO.md`. Revisão anterior confirmou tabelas/índices/FKs/checks novos, transação e ausência de exclusões/atualizações de dados legados. Não houve ensaio em banco isolado nesta sessão.

**Backup recuperável ainda não criado:** falta acesso administrativo ao Neon/rotina de backup para criar e validar um ponto de recuperação. Antes de aplicar: confirmar banco, criar backup e testar recuperação isolada; obter aprovação específica do SQL; conferir resultado; obter aprovação da concessão restrita ao User.id; executar bootstrap idempotente com auditoria; testar recusa de proprietário comum. Bloqueio comercial permanece desativado. Não executar migrate deploy cego sobre histórico legado.

## Validação e limitações

- Suíte completa: **198 testes aprovados**, com mocks e dados isolados. Cobriu autenticação, isolamento, checkout, balcão/caixa, baixa única, cancelamento, catálogo, convites, horários, PWA, campanhas e integrações preparadas.
- Após os últimos ajustes, mais 25 testes direcionados de estoque, catálogo e operação passaram. Os sete testes de `stock-inline.test.ts` também passaram, incluindo três adicionados depois da suíte completa para contagem concorrente, inclusão de produtos sem controle e disputa com edição do catálogo. Não é uma segunda execução integral de 201 testes.
- TypeScript, Prisma validate e build final de produção aprovados, incluindo a comparação atômica e o histórico por ID.
- Primeira tentativa de build falhou por EPERM ao criar saída temporária em `.next`; repetida com permissão para a saída gerada. Nenhuma configuração foi alterada para esconder verificações.
- Medição inicial da loja publicada: HTTP 200, primeiro byte aproximadamente 1,44 s, transferência aproximadamente 4,90 s. É uma amostra de rede, não benchmark de navegação autenticada nem garantia de melhora.
- Navegador expirou em duas tentativas nesta sessão. **Não houve aprovação visual nova das oito larguras, das telas internas nem captura nova de screenshots.** Evidência anterior não foi apresentada como teste das alterações novas.
- Nenhuma conta real de entregador foi usada para executar operações; teste real de convite/e-mail/PWA permanece pendente. Não foram alteradas senhas.
- WhatsApp permanece sem conexão real; Meta/Embedded Signup e serviços externos conservam dependências anteriores. Asaas continua preparado para Sandbox, sem cobrança de produção. Nada foi anunciado como homologado.

## Roteiro manual do proprietário

1. Entrar no painel com a conta da loja; comparar estado efetivo com a vitrine e consultar horários, sem alterar a agenda para este teste.
2. Em ambiente autorizado, testar Salvar/Cancelar de quantidade, mínimo, custo e preço; deixar outra aba modificar a quantidade e verificar recusa da contagem antiga. Conferir histórico/responsável.
3. Repor um produto zerado, conferir visibilidade e capacidade de compra sem republicar. Conferir variante/combos. Só criar pedido real se desejar executar uma operação real.
4. Comparar uma venda de balcão e uma de checkout com os movimentos; confirmar uma única baixa e restauração compatível no cancelamento.
5. Compartilhar convite da própria loja, ativar com e-mail do entregador autorizado, entrar com sua conta e conferir isolamento; não usar conta do proprietário como entregador.
6. Abrir os três aplicativos instalados e confirmar ausência dos botões principais; conferir instruções em Configurações. Testar Android/iOS/Windows disponíveis.
7. Revisar desktop e 320/360/375/390/414/768/1024/1440 px: hero, cards, sacola, tabela/edição de estoque, modais e menu.

Rotas: `/app/estoque`, `/app/catalogo`, `/loja/loja-0102/`, `/entregador/`, `/admin` (aguarda ativação).

## Publicação confirmada

Código publicado em `origin/main`: `a857839907936c571fa4ad39e81c84c055d31645` — `Corrige estoque vitrine horarios e acesso dos entregadores`.

Vercel confirmou **success / Deployment has completed**, com deploy https://vercel.com/lp070087-5894s-projects/adega/6VdcDAtoMmQGjQB8vHKQTf32mKWk . Após a confirmação, a loja retornou HTTP 200 com os marcadores novos de categoria e hero e a cor `#fa7500`. `/app/estoque` e `/app/catalogo` redirecionaram ao login; `/admin` ao login central; `/entregador/` retornou 200. Manifests do painel e da loja retornaram 200. O manifest do entregador, na rota histórica `/manifest.webmanifest`, retornou 200 com nome Del Flash Entregador, id `/entregador` e scope `/entregador/`.

Essas verificações HTTP confirmam publicação e proteção das rotas, sem equivaler a renderização visual ou operação autenticada. A documentação posterior não altera o código validado. Nenhuma operação protegida foi aplicada.

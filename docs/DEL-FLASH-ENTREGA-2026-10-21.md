# Del Flash — entrega e ativações pendentes

Continuidade sobre `7de4c0a`, preservando banco, usuários, organizações, produtos, pedidos e identificadores técnicos. Nenhuma migração, privilégio, saldo, pedido, cobrança ou disparo real executado nesta etapa.

## Identidade e navegação

- Del Flash substitui a marca institucional exibida. Paleta: marinho #0B1F3A, oceano #087EA4, azul #168FE5, claro #EAF5FF e branco. Nomes de tabelas, repositório, domínios, slugs comerciais técnicos e IDs dos aplicativos permanecem preservados.
- Ícones vetoriais próprios: raio de velocidade para gestão, localização/raio/trilhas para entregador, sacola/raio para loja. PNGs 192/512, versões maskable 512 com fundo opaco, favicon SVG/PNG e metadados atualizados. Geração reproduzível pelo script existente, sem fotografias inventadas.
- Manifests mantêm os IDs instalados: `/app`, `/entregador`, `/loja/[slug]`. Atualização dos ícones instalados depende do navegador/sistema; não foi criado APK.
- Menu na ordem solicitada: Operação (Visão geral, Pedidos, Clientes, Catálogo, Atendimento com IA), Financeiro (Caixa, Vendas, Estoque, Relatórios), Gestão (Combos, Expedição, Entregadores), Marketing (Banners, Campanhas, Programa de pontos), Sistema (Configurações). Equipe e assinatura permanecem acessíveis dentro de Configurações; rotas anteriores preservadas.
- Link Admin Central depende de autorização global válida consultada no servidor. E-mail não concede permissão. Sem ativação, o link não aparece.
- Botões de instalação principais são ocultados no contexto instalado detectável, incluindo media query para evitar piscada no modo standalone. Instruções permanecem em Configurações e na página própria de instalação do entregador. Não presume detecção de apps instalados fora do contexto atual.
- Vitrine mantém cores e marca de cada loja, imagens e banners. Confirmação de adição à sacola agora permanece visível junto à área de interação, com feedback de pressão e respeito a movimento reduzido.

## Operação

- Entrega Turbo independente: `ENTREGA-TURBO-DEL-FLASH-2026-10-21.md`. Prévia, público recente/personalizado, consentimento explícito, disponibilidade e avisos internos persistidos; sem disparos externos.
- Entregadores: `DEL-FLASH-ENTREGADORES-2026-10-21.md`. Escala compacta por dia e convite vinculado à loja, exigindo cadastro prévio aprovado, senha própria e confirmação segura de e-mail. Não cria vínculos públicos irrestritos.
- Estoque/catalogação: `DEL-FLASH-ESTOQUE-CATALOGO.md`. Prévia, confirmação, ajuste auditado e idempotente de cadastros existentes; sem duplicação. Produtos com categoria desativada deixam de sumir; estoque zero permanece visível. Combos consideram disponibilidade/quantidade dos componentes.
- Atendimento IA: número empresarial solicitado, dias/horário de Brasília e resposta automática fora do horário configuráveis por organização. Alterar número não conecta a Meta. Ativação da IA preserva essas preferências e exige canal real verificado. Opt-out, limite diário e janela de atendimento continuam respeitados.
- Plano institucional Del Flash Completo, R$ 119,00 mensais. Slug técnico e contratos existentes não são renomeados ou reprecificados automaticamente.

## Prévia de estoque — somente leitura

Consulta em 21/10/2026, organização **Loja 0102**, slug `loja-0102`, ID `cmu1bc6nn0000jmzwcst095z8`:

| Item | Estado observado | Proposta a confirmar |
|---|---|---|
| Produtos | 89 | 89 selecionáveis |
| Saldo | 88 com zero; 1 com 12 | 25 por produto |
| Unidades totais | 12 | 2.225 |
| Mínimo | 88 com zero; 1 com 50 | 5 por produto |
| Ativações necessárias | 0 | 0 |
| Alterações de disponibilidade/controle | 0 | 0 |
| Excluídos por combos/pedidos em andamento | 0 | 0 na consulta |

**Nenhum saldo foi alterado.** A proposta inclui substituir o saldo existente de 12 por 25 e o mínimo existente de 50 por 5. Exige confirmação explícita para esta organização e nova prévia antes da aplicação; pedidos e saldos podem mudar após a consulta. Referência de operação e impressão do estado protegem repetição e concorrência.

## Admin Central — aprovação protegida

Consulta somente de leitura confirmou conta ativa `lp070087@gmail.com`, User.id `cmu0pypp60000jm9opt2k0l7j`. As seis tabelas comerciais continuam ausentes. SQL revisado por inspeção: cria apenas PlatformOperator, PlatformContract, SaaSCharge, PlatformAudit, PlatformSetting e PlatformSupportCase, índices, FKs restritas e checks nas tabelas novas, dentro de transação. Nenhuma instrução exclui ou atualiza dados legados. Não foi aplicado nem ensaiado em banco isolado nesta etapa; Prisma validate não substitui execução de SQL.

Plano de execução, após aprovação específica:

1. Confirmar a conexão escolhida e criar backup/snapshot recuperável no Neon. Validar restauração em ambiente isolado e registrar referência/horário. **Backup não foi criado por esta sessão**; `pg_dump` não está disponível localmente e não há acesso administrativo ao console Neon configurado nesta tarefa.
2. Conferir novamente ausência/conflito de nomes e estado do histórico de migração. Aplicar exclusivamente o SQL aditivo comercial pela janela aprovada, conforme `ADMIN-COMERCIAL-ATIVACAO.md`; não executar migrate reset/db push/seed nem deploy cego sobre schema legado.
3. Conferir tabelas, FKs, índices/checks e ausência de alterações legadas. Se houver falha, conferir rollback da transação antes de repetir.
4. Após aprovação também da concessão, executar procedimento idempotente de OWNER somente para o User.id acima, com referência de aprovação, e conferir auditoria. Não criar usuário ou alterar senha.
5. Ativar Admin Central no servidor. Manter bloqueio comercial e cobranças reais desativados. Verificar acesso legítimo e recusa de proprietário comum.

Recuperação: manter flags desligadas em caso de erro, preservar auditoria e novas tabelas que já tenham dados, corrigir aditivamente. Restaurar backup somente com plano aprovado que considere alterações posteriores. Não usar DROP para desfazer ativação.

## Serviços externos e limites

- WhatsApp: Embedded Signup ainda depende da implementação/habilitação e homologação do fluxo Meta, permissões e número elegível. Canal e webhook reais não foram conectados. Preferências operacionais não confirmam conexão. A migração Assistant continua separada e pendente de aprovação.
- E-mail: Resend/remetente/URL HTTPS necessários; sem envio real nesta sessão. A falta de serviço mantém o convite pendente, sem alegar envio.
- Asaas: Sandbox preparado e testado com mocks; sem credenciais/homologação real. Produção bloqueada; não foram criadas cobranças nem alterados contratos.
- Upload: provedor persistente depende de configuração. Não houve upload real.
- Instalação física Android/iPhone/desktop e testes reais de compra/entrega permanecem pendentes. Painéis autenticados não podem ser declarados visualmente aprovados sem sessão de teste autorizada.
- Estorno avulso de caixa ainda não possui vínculo automático com reversão de pontos, conforme relatório anterior.

## Validação e publicação

### Retomada após interrupção

O Git remoto foi reconferido: `9382e6c` permanecia publicado e sincronizado com `origin/main`. A única alteração local anterior à retomada era a confirmação de deploy neste relatório; a pasta original `web/Banneres public/` permaneceu sem versionamento.

Consulta atual somente de leitura confirmou a conta proprietária ativa e a ausência das seis tabelas comerciais. Nenhuma concessão ou migração foi realizada. A prévia de estoque de 89 produtos, 12 unidades atuais e 2.225 propostas foi preservada; não foi reaplicada nem tratada como autorização.

Foi corrigida uma lacuna do atendimento: o catálogo fornecido à IA agora inclui variantes ativas, com seus próprios IDs de seleção, preço vigente mais ajuste e link para o produto/variante reais. Embalagem, volume e quantidade por caixa não são herdados indevidamente do produto pai. Combos indisponíveis pelos componentes deixam de ser oferecidos. Nenhum produto, variante ou preço foi criado ou alterado no banco.

Validação nova limitada ao recurso alterado: **15 testes direcionados aprovados, incluindo quatro novos**, e TypeScript aprovado. Os 183 testes da etapa anterior permanecem como evidência anterior, sem alegação de nova execução integral ou E2E real. Build de produção do ajuste aprovado. Nenhum schema Prisma foi alterado; a validação anterior foi preservada.

Código publicado em `origin/main`: `232b57d9597cec3396a3baf51bda0ef4e7caaaac`. O status do commit no GitHub confirmou Vercel **success / Deployment has completed**, com deploy em https://vercel.com/lp070087-5894s-projects/adega/4Lb9qXi4tqYPJohgKBBgVH4Q6Uuf . Conferência HTTP após o deploy: `/login`, `/entregador/` e `/loja/loja-0102/` retornaram 200; `/admin` redirecionou para `/admin/login` e `/app/dashboard` para `/login`, preservando a autenticação. Esta confirmação documental não modifica o código validado nem substitui testes operacionais reais.

### Situação dos itens solicitados

| Item | Classificação | Evidência e limite |
|---|---|---|
| Menu na ordem solicitada e Minha Loja em Configurações | Concluído no código; operação autenticada pendente | Navegação e redirecionamentos preservados; nenhuma sessão disponível para revisão visual interna |
| Atendimento com IA e links de produtos/variantes | Implementado e validado com mocks | Catálogo real isolado por loja, preços do servidor, variantes ativas e disponibilidade de combos; sem chamada real à IA |
| WhatsApp Business oficial | Dependente de credenciais/aprovação; conexão não ativa | Canal por organização, webhook, fila e atendimento humano preparados; migração Assistant e configuração oficial pendentes |
| Embedded Signup Meta | Ainda não implementado/homologado | Botão permanece desativado; não é um fluxo OAuth funcional aguardando apenas uma chave |
| Entrega Turbo e seleção de público | Implementado e testado com mocks | Independente, com prévia, consentimento e avisos internos; nenhum disparo real |
| Campanhas separadas de pontos | Implementado e testado com mocks | Estados e regras separados; estorno avulso de caixa ainda não reverte pontos automaticamente |
| Escalas recolhíveis | Implementado; teste operacional autenticado pendente | Accordion, validação antes de recolher e persistência; testes direcionados anteriores preservados |
| Convite por loja e cadastro do entregador | Implementado; teste real de e-mail pendente | Exige perfil previamente aprovado, senha própria e prova de e-mail; depende de remetente/provedor |
| Três PWAs independentes | Implementado e validado em código/HTTP | Manifests, escopos e ícones próprios; instalação física Android/iPhone/desktop pendente |
| Ocultação de instalação no contexto instalado | Implementado; teste em aparelho pendente | Media query, modo standalone e suporte iOS; instruções mantidas em Configurações |
| Disponibilização estoque → catálogo | Implementado e testado com mocks | Prévia, confirmação, auditoria e idempotência; nenhum saldo aplicado |
| Todos os produtos publicados na vitrine | Corrigido e validado na etapa anterior | Sem corte por estoque zero/categoria desativada; disponibilidade de combos pelos componentes |
| Skeletons em transições | Implementado e testado | Formatos reutilizáveis e limites de carregamento; não substituem validação visual das telas privadas |
| Identidade Del Flash, ícones e manifests | Concluído e verificado em produção | Cores das lojas preservadas e IDs técnicos dos aplicativos mantidos |
| Responsividade interna autenticada | Não validada visualmente | Nova tentativa de abrir `/app/dashboard` redirecionou ao login; não foram criadas credenciais nem burlada autenticação |
| Asaas Sandbox e plano R$ 119,00 | Implementado e testado com mocks | Sem homologação real, credenciais ou cobranças; produção bloqueada |
| Acesso vinculado à situação comercial | Implementado com ativação controlada | Política por contrato e flag desligadas; pagamentos Sandbox não liberam acesso real. Sincronização financeira de produção ainda requer conclusão/homologação de go-live |
| Admin Central e link exclusivo | Dependente de aprovação | Seis tabelas ausentes; OWNER não concedido. Link depende de autorização global consultada no servidor |

Procedimentos de backup, SQL aditivo, concessão restrita e recuperação permanecem descritos acima e em `ADMIN-COMERCIAL-ATIVACAO.md`. Nenhuma autorização operacional foi presumida nesta retomada.

### Evidência preservada da etapa 9382e6c

Testes: 183 aprovados com mocks e fixtures isoladas. TypeScript e Prisma validate aprovados. Build de produção aprovado. Login, cadastro, login do entregador, convite e loja renderizados no navegador nas oito larguras solicitadas (320, 360, 375, 390, 414, 768, 1024 e 1440), sem excesso horizontal. Capturas salvas na pasta de visualizações da sessão em del-flash-2026-10-21. Expansão de cervejas, adição de Amstel à sacola, contador, confirmação visível e remoção foram executados apenas no estado local do navegador, sem concluir pedido. Marca laranja da loja conferida como #fa7500. Painéis autenticados e instalação física não foram visualmente validados. Código publicado em origin/main: `9382e6c53fbbfb54e70da43832b8a4b59b12af28`. Vercel confirmou Deployment has completed: https://vercel.com/lp070087-5894s-projects/adega/3CaTK9BLaSyJHLsnCuUYiHNK6CtK . HTTP de produção confirmou login, entregador, convite, loja, configurações do cliente, favicon, manifest e ícone maskable com retorno 200; Admin Central e painel do estabelecimento redirecionam ao login. Navegador confirmou Entrar · Del Flash, com captura publicado-login-390.jpg. Este registro documental posterior não altera o código validado. Nenhuma validação com mocks deve ser descrita como E2E real.

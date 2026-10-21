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

Testes: 183 aprovados com mocks e fixtures isoladas. TypeScript e Prisma validate aprovados. Build de produção aprovado. Login, cadastro, login do entregador, convite e loja renderizados no navegador nas oito larguras solicitadas (320, 360, 375, 390, 414, 768, 1024 e 1440), sem excesso horizontal. Capturas salvas na pasta de visualizações da sessão em del-flash-2026-10-21. Expansão de cervejas, adição de Amstel à sacola, contador, confirmação visível e remoção foram executados apenas no estado local do navegador, sem concluir pedido. Marca laranja da loja conferida como #fa7500. Painéis autenticados e instalação física não foram visualmente validados. Publicação: registrar após push/deploy confirmado. Nenhuma validação com mocks deve ser descrita como E2E real.

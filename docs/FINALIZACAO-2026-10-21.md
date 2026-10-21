# Entrega de continuidade — 21/10/2026

Base preservada: `6e7dfa9`. Nenhuma migração, seed, privilégio, pedido, cobrança ou e-mail real foi criado nesta etapa.

## Implementado nesta etapa

- Administração Asaas em `/admin/asaas`, protegida no servidor, credenciais cifradas e ambientes separados. Criação mensal de R$ 119,00, consulta, suspensão/reativação/cancelamento **somente Sandbox**. Webhook autenticado, deduplicado e com consulta do pagamento real na API antes de registrar a situação de homologação.
- Dados Sandbox separados dos contratos, cobranças e indicadores financeiros reais. Escritas Asaas de produção e webhook de produção continuam bloqueados. Ver `ASAAS-SANDBOX-2026-10-21.md` para limites e homologação.
- PWAs independentes: estabelecimento, entregador e cliente por loja, com identidades/ícones próprios, limites de escopo, instalação orientada por navegador e workers sem cache de dados privados ou operações offline.
- Skeletons reutilizáveis em dashboards, listas, formulários, catálogo, detalhes e entregador, com limites de carregamento nas três áreas, admin e acesso. Movimento reduzido e leitores de tela respeitados.
- Rotas antigas mantidas com redirecionamentos que preservam parâmetros. Não altera preços, estoques ou vínculos existentes.

## Admin Central e autorização pendentes

Consulta de leitura em 21/10 confirmou a conta ativa `lp070087@gmail.com`, ID já documentado no procedimento de ativação. As seis tabelas comerciais continuam ausentes. Nenhum acesso global foi concedido.

Aprovação específica necessária: aplicar a migração comercial revisada, conceder OWNER somente ao ID existente conferido pelo procedimento idempotente e ativar o Admin Central. Bloqueio comercial deve permanecer desligado. Ver `ADMIN-COMERCIAL-ATIVACAO.md`. Nenhuma nova migração é necessária para Asaas/PWAs/skeletons desta etapa.

## Serviços externos

- **Asaas:** integração de homologação preparada e testada com mocks; sem credenciais, chamadas reais ou homologação Sandbox. Não representa autorização de go-live. Consulta administrativa limitada às primeiras 100 cobranças; conciliação de resposta inconclusiva permanece manual. QR Pix tem cliente HTTP, mas ainda não há área de pagamento do assinante com QR homologado.
- **WhatsApp/IA:** estrutura oficial preparada, ainda depende da migração Assistant e configuração Meta/modelo, número verificado, webhook e permissões. Embedded Signup não foi concluído/homologado. Não está conectado.
- **E-mail dos entregadores:** envio real via Resend implementado, depende de chave/remetente verificado/URL pública. Não foi enviado e-mail de teste.
- **Upload:** provedor Cloudinary persistente implementado com validação; depende de configuração real. Não foi feito upload de teste.
- **PWA:** instalação física Android/iPhone/desktop e push não foram testados. Worker não promete operação offline. Notificações de escala são internas; não são push automático.

## Módulos preservados e limites reais

Checkout e estoque transacional, idempotência, atribuição de entregador, escala, ativação individual, permissões e caixa/troca de turno foram mantidos e abrangidos pela suíte com mocks. Não houve pedido, pagamento ou entrega real executado nesta etapa.

Pontos permanecem opcionais, desligados por padrão, com prevenção de duplicidade e reversão no cancelamento de pedido. Estorno financeiro avulso de caixa não possui vínculo automático ao pedido/cliente: a reversão correspondente de pontos ainda requer evolução desse vínculo, sem alterar lançamentos históricos.

Campanhas não enviam mensagens em massa. Turbo depende de configuração e capacidade verificada. Plano público principal R$ 119,00 preservado, sem modificar contratos existentes nem criar cobranças automáticas.

## Validações

- Testes automatizados: **159 aprovados**, incluindo autorização, isolamento, entregadores, estoque, caixa, campanhas, pontos, Asaas, instalação e skeletons.
- TypeScript: aprovado após corrigir a assinatura tipada do middleware.
- Prisma: schema validado, sem executar DDL.
- Build: aprovado novamente após a correção real de redirecionamento.
- Navegador: versão compilada local da loja e login do entregador renderizada nas larguras 320, 360, 375, 390, 414, 768, 1024 e 1440, sem excesso horizontal. Instruções de instalação da loja abertas e verificadas em 390 px. Screenshots final-loja-*.jpg, final-entregador-*.jpg e final-instalacao-loja-390.jpg na pasta de visualizações da sessão. Painéis autenticados não foram revisados visualmente por falta de sessão autorizada. Instalação física não executada. O teste HTTP real detectou um ciclo de redirecionamento e motivou correção com regressão usando NextRequest/NextResponse reais; build repetido e HTTP confirmado: redirecionamento único para a URL com barra, preservação da consulta, retorno 200 no destino, manifests/workers 200 e painel privado redirecionando ao login.

## Roteiro posterior do proprietário

1. Aprovar e executar ativação central conforme procedimento, confirmar que proprietário comum não acessa `/admin`.
2. Homologar Asaas com conta Sandbox, contrato elegível e dados de teste. Reenviar evento e conferir ausência de duplicidade; verificar que receita e acesso reais não mudam.
3. Instalar painel, entregador e loja no mesmo aparelho; conferir que permanecem três ícones e escopos distintos. Conferir atualização e aviso de falta de conexão.
4. Configurar remetente real; cadastrar entregador de teste pelo estabelecimento, ativar por link recebido, definir senha, testar recuperação e desativação com revogação de sessão.
5. Em ambiente autorizado, realizar compra → painel → atribuição → início → entrega → consulta do cliente → caixa. Conferir estoque, valor, retirada sem frete e repetição do clique sem duplicidade.
6. Abrir/fechar/trocar turno com operadores distintos e conferir saldo. Testar pontos/campanhas opcionais sem assumir disparo externo.
7. Revisar painéis autenticados nas oito larguras; conferir modais, teclado, tabelas e instalação física em dispositivos reais.

## Publicação

Código publicado em origin/main: `afbaa5f661b6406190eba7dda46d0b766100203a`. GitHub confirmou Vercel success / Deployment has completed para esse commit: https://vercel.com/lp070087-5894s-projects/adega/BSs8jLCjQ3AdVh8z4pKzMMiykmEM . Loja e entregador retornaram 200 nas URLs canônicas, links antigos redirecionaram uma única vez, manifests/workers retornaram 200 com escopos corretos e os painéis privados exigiram login. A loja publicada carregou catálogo e botão de instalação no navegador em 390 px; captura publicado-loja-390.jpg salva. Este registro documental posterior não altera o código validado. A pasta original não versionada `web/Banneres public/` permanece excluída da entrega, assim como segredos e arquivos gerados.

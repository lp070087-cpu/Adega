# Área do cliente, entregador e abertura manual — 21/10/2026

## Estado e limites

Base preservada: `feeaf80`, código anterior `a857839`. Nenhuma migração, alteração de estoque, concessão OWNER, criação de pedido real ou mudança de senha real foi executada nesta etapa.

### Entregador

- Cadastro inicial exige primeiro nome e e-mail; telefone e dados operacionais são opcionais. Cadastro existente e vínculo por organização preservados.
- Convites continuam restritos ao entregador previamente cadastrado, com comprovação por e-mail e senha escolhida pelo destinatário. O link da loja não permite adesão pública irrestrita.
- Correção concreta: logout reutilizava o destino `/login` do estabelecimento. Agora encerra a sessão e retorna a `/entregador/`, dentro do escopo do PWA. Login também usa esse destino canônico.
- Conta sem vínculo não ganha acesso. Sessão do proprietário recebe orientação para trocar de conta. Cadastro de entregador inativo tem orientação específica; sessões revogadas continuam bloqueadas.
- Navegador de produção: abriu a tela de login, sem sessão autenticada de entregador. **O painel autenticado, entregas, logout e persistência reais ainda precisam da sessão autorizada solicitada ao proprietário.** Não foi usada conta de proprietário como substituta.

### Cliente

- Cabeçalho da loja com Entrar/Criar conta; menu de perfil após autenticação.
- Rotas `/loja/[slug]/conta`, `/entrar`, `/criar-conta`, `/recuperar`, `/confirmar`, `/dados`, `/enderecos`, `/pedidos`, `/notificacoes` e `/pontos` (condicional), sob o mesmo prefixo `conta`.
- Sessão própria, cookie HttpOnly por loja, token aleatório com hash no banco, opção de sete dias; não concede papéis administrativos.
- Cadastro com nome/e-mail/senha/confirmação. E-mail precisa ser comprovado antes do login. Alterações de e-mail/senha e recuperação invalidam sessões e tokens antigos. Links de uso único, 30 minutos, enviados pelo Resend configurável; falha de envio não é apresentada como sucesso.
- Endereços próprios com edição, exclusão confirmada e principal. Pedidos associados somente durante checkout autenticado com sessão revalidada na transação. Histórico de compras sem login não é capturado por coincidência de telefone/e-mail.
- Sacola existente permanece no armazenamento local da loja; entrar/sair não a apaga. Checkout pode preencher dados/endereço escolhido e mantém compra sem login.
- Pontos: regras e lançamentos dos pedidos vinculados, apenas se o programa estiver ativo. **Saldo integral e resgates de cadastros antigos dependem de vinculação verificada adicional; não foram associados automaticamente.**
- Área usa a cor da loja e o manifest/service worker do PWA da loja; nenhum quarto aplicativo foi criado.

## Migração do cliente — pendente de aprovação

Arquivo: `web/prisma/migrations/20261021180000_customer_portal/migration.sql`.

Cria cinco tabelas novas: CustomerPortalAccount, CustomerPortalSession, CustomerPortalToken, CustomerPortalAddress e CustomerPortalOrder. Índice único de e-mail por organização, índices de sessão/token/endereço/histórico e seis chaves estrangeiras nas tabelas novas. Nenhuma coluna existente é alterada; não há DELETE, TRUNCATE, DROP, seed nem atualização de registros existentes. Relações adicionadas ao schema Organization/Order são virtuais, sem nova coluna nas tabelas antigas.

Ativação protegida por `CUSTOMER_PORTAL_ENABLED=true` **e** existência das cinco tabelas. Sem ambas, a área informa ativação pendente e o checkout convidado permanece disponível. Publicar o código não ativa cadastro/login em produção.

Procedimento após aprovação específica:

1. Confirmar projeto/branch Neon e banco do deploy, sem imprimir URLs ou segredos. Criar branch recuperável/PITR ou backup consistente e comprovar a recuperação em ambiente separado.
2. Conferir ausência de conflito com os cinco nomes e comparar o schema real. Validar a migração em banco isolado primeiro.
3. Na pasta `web`, executar exclusivamente o SQL aprovado: `npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20261021180000_customer_portal/migration.sql`. O arquivo inclui BEGIN/COMMIT. **Não executar migrate deploy indiscriminadamente**, pois existem migrações administrativas anteriores ainda dependentes de aprovação.
4. Após confirmar tabelas, índices e FKs, registrar apenas essa migração: `npx prisma migrate resolve --schema prisma/schema.prisma --applied 20261021180000_customer_portal`.
5. Configurar no servidor `RESEND_API_KEY`, remetente verificado `MAIL_FROM` e origem HTTPS `APP_PUBLIC_URL`. Validar envio autorizado antes de habilitar `CUSTOMER_PORTAL_ENABLED=true` e publicar a configuração.
6. Em falha antes do COMMIT, a transação desfaz a criação. Em falha de aplicação após ativação, desligar a flag e voltar ao código anterior, preservando as tabelas/dados novos. Recuperação do backup somente por procedimento aprovado; não apagar tabelas para reverter código.

Essa migração é independente da ativação das seis tabelas comerciais/Admin Central. Não concede OWNER nem cria cobranças.

## Abertura da loja

Modos persistidos no JSON existente: AUTO segue horários/fuso; MANUAL_OPEN permite pedidos fora da agenda; MANUAL_CLOSED impede novos pedidos. Horários preservados. Sem escolha nova, comportamento legado é preservado. Apenas usuários com permissão podem alterar; ação registra responsável e invalida loja/painel. Vitrine consulta mudanças a cada 15 segundos enquanto visível e ao recuperar foco; abas do mesmo navegador recebem sinal imediato. Checkout revalida o estado dentro da transação, impedindo novo pedido após fechamento concorrente.

## Roteiro real posterior, com autorização

1. Disponibilizar sessão de entregador ativo cadastrado, não de proprietário. Conferir nome/loja, escala, pedidos próprios e histórico; sair e entrar novamente; verificar persistência e instalação em dispositivo real.
2. Em banco isolado migrado e com e-mail de teste autorizado, cadastrar cliente, comprovar identidade, testar senha errada/correta, recuperação e expiração/uso único do link.
3. Adicionar produto à sacola, entrar e voltar à loja; confirmar preservação. Salvar dois endereços, trocar principal, editar/excluir e comprovar bloqueio de acesso cruzado.
4. Abrir checkout e preencher endereço, sem confirmar pedido real. Histórico exige pedido de teste autorizado no ambiente isolado; compras de outro cliente/loja não devem aparecer.
5. Verificar desktop/celular, olho da senha, teclado, menu e PWA. Mudar modos de abertura somente com autorização do responsável, preservando horários.

## Validação e publicação

- `npm test`: 209 aprovados. Após os últimos ajustes, execução direcionada de `customer-portal.test.ts` e `driver-access.test.ts`: 25 aprovados. Há sobreposição entre as execuções; esses números não devem ser somados como testes distintos.
- `npm run typecheck`: aprovado. O build final também verificou os tipos de toda a aplicação.
- `npm run db:validate`: aprovado; somente validação local do schema.
- `npm run build`: aprovado, incluindo as novas rotas de conta e o endpoint de abertura.
- Testes isolados cobriram confirmação de e-mail/uso único, hashes e expiração, cookies por loja, login/logout, propriedade de endereços e confirmação de exclusão, cadastro mínimo do entregador, retorno correto do logout, preservação de horários, fechamento concorrente do checkout e vínculo do pedido somente com sessão válida.
- Navegador de produção: cabeçalho com Entrar/Criar conta confirmado, com laranja preservado. Captura local: `C:/Users/55819/.codex/visualizations/2026/10/19/01a15263-4834-7f30-bd9b-64b1d7d8d4bf/del-flash-loja-conta-publicada.png`. O navegador apresentou falhas intermitentes de navegação e não alcançou o servidor local. **Não foram aprovados testes visuais das telas autenticadas nem a revisão mobile desta etapa.**
- Verificação HTTP pública após deploy: loja, `/loja/loja-0102/conta/entrar` e `/entregador/` responderam 200. Loja contém os dois acessos novos; conta apresenta ativação pendente; entregador oferece primeiro acesso. Essas verificações não são testes autenticados.
- Código publicado em `main`: `265e4c1a5f6c892409bd565f27ec1464305119ee`.
- Vercel confirmou `success`, descrição `Deployment has completed`, para esse commit: https://vercel.com/lp070087-5894s-projects/adega/ApdAb27VtfK9pDRC6GSqthSQFPkL .

Testes com mocks não equivalem a autenticação real, envio real de e-mail ou compra real. A causa específica da sessão relatada pelo proprietário não foi confirmada sem o perfil de entregador autorizado; a falha de destino do logout foi comprovada no código e corrigida/testada isoladamente.

### Links e pendências finais

- Loja: https://adega-nine.vercel.app/loja/loja-0102/
- Cliente: https://adega-nine.vercel.app/loja/loja-0102/conta/entrar
- Cadastro do cliente: https://adega-nine.vercel.app/loja/loja-0102/conta/criar-conta
- Entregador: https://adega-nine.vercel.app/entregador/
- Convite da loja: https://adega-nine.vercel.app/entregador/convite/loja-0102

Pendentes: aprovação específica e execução acompanhada da migração de cinco tabelas, configuração/verificação do provedor de e-mail no deploy, habilitação da flag após validação isolada, sessão real autorizada de entregador e testes autenticados/mobile. Saldo integral de pontos antigos exige vinculação comprovada adicional. Nenhuma dessas dependências foi simulada como ativa.

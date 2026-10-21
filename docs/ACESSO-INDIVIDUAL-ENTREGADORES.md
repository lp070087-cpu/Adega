# Acesso individual dos entregadores

## Implementação

Novos cadastros em `/app/entregadores` exigem e-mail individual. A conta é criada sem senha utilizável e com primeiro acesso pendente; apenas o vínculo DRIVER da organização cadastradora é criado. Nome, telefone, veículo, placa, ativo/inativo, escala e instalação permanecem disponíveis. A escala é configurada na seção de horários após salvar o cadastro.

O estabelecimento não escolhe nem vê a senha. A alteração explícita do e-mail de um entregador exige nova verificação, revoga sessões anteriores e preserva o hash antigo até a confirmação pelo titular. E-mail de conta já existente não é reutilizado para vincular outra pessoa/loja. Contas com perfis de proprietário ou funcionário não podem ser alteradas por esse fluxo. IDs e vínculos existentes são preservados; acessos legados por username continuam aceitos no login.

`/entregador/acesso` oferece Primeiro acesso e recuperação. O link contém 32 bytes aleatórios, expira em 30 minutos e é armazenado como SHA256 em VerificationToken. O token fica no fragmento do link, não no GET do servidor; a página o remove do endereço após carregar. Consumo único, verificação do vínculo ativo, definição da senha, verificação de e-mail, revogação anterior e registro administrativo ocorrem na mesma transação. A senha só é alterada quando o titular envia o formulário com prova válida. Não há alteração automática de senha existente.

Solicitações repetidas para o mesmo titular/finalidade durante a validade não enviam novo e-mail. A resposta pública é condicional e idêntica para conta ausente, inativa ou de outro perfil. Falha do provedor não é apresentada como e-mail entregue. Não existe confirmação de entrega real na caixa postal sem validação do provedor.

Login tem olho SVG, Manter conectado, Esqueci minha senha e Primeiro acesso. Usa cookie seguro da autenticação existente; não guarda senha em localStorage. Novas sessões de entregador têm duração absoluta de até 8 horas ou 7 dias com Manter conectado. Desativação revoga sessões no servidor, inclusive após reativação do cadastro; uma nova autenticação é necessária. Cadastro inativo, conta inativa e acesso ainda não ativado são recusados. Login normal do proprietário/admin permanece preservado.

Contas com registro de operador central são excluídas da recuperação e da edição de credenciais pelo estabelecimento, inclusive quando também possuírem vínculo local DRIVER. A verificação consulta a existência da tabela antes de consultar o modelo, preservando compatibilidade enquanto a migração central não foi aplicada. Falhas de infraestrutura recusam a alteração. A edição também recusa contas vinculadas a outra organização. A trava transacional já existente do onboarding foi preservada e ampliada para impedir reutilização de um vínculo DRIVER desativado para criação de estabelecimento.

Disponibilidade e atribuição exigem acesso ativo e ativado. Trocar e-mail durante entregas atribuídas é recusado; após a troca, o cadastro fica offline até nova ativação. Escalas podem ser configuradas enquanto o acesso está pendente, sem afirmar que o entregador já consegue entrar.

## Configuração externa

Para envio: RESEND_API_KEY, MAIL_FROM com remetente/domínio autorizado e APP_PUBLIC_URL HTTPS, todos no servidor. Nenhum segredo é enviado ao navegador. O botão de envio fica indisponível quando essa configuração está ausente. Documentação oficial consultada: https://resend.com/docs/api-reference/emails/send-email . Não foram criadas credenciais nem enviado e-mail real nesta execução.

Reutiliza User.mustChangePassword, User.emailVerified, VerificationToken e Organization.settings já previstos no schema. Não introduz migração. As migrações centrais e do atendimento WhatsApp continuam separadas e pendentes de aprovação; não são necessárias ao login existente do entregador.

A disponibilidade da tabela VerificationToken foi confirmada por consulta somente de leitura no banco configurado localmente. Nenhum token foi criado ou alterado nessa verificação.

## Instalação e operação

PWA existente preservado: manifest, ícones, service worker sem cache de dados privados, endereço compartilhável e instruções Android, iPhone e desktop. Não há APK ou loja de aplicativos fictícia. A instalação não concede acesso. Escala semanal, avisos internos do dia seguinte, disponibilidade, atribuição, etapas, falha e histórico continuam sob os guardas da própria organização e do próprio driver.

## Testes e roteiro posterior

141 testes automatizados aprovados, com mocks/dados isolados. Cobrem emissão/hash/expiração, bloqueio de duplicidade, token incorreto/de outra finalidade/de outro usuário, consumo concorrente simulado, conta inativa, proteção do proprietário/operador central, recuperação, criação sem senha administrativa, sessões, atribuição bloqueada antes da ativação e revogação após reativação. TypeScript e build final aprovados. Prisma validado na etapa operacional; schema não foi alterado pelo acesso individual. Não equivalem a teste de concorrência em PostgreSQL ou e-mail/login reais.

Depois de configurar o e-mail, o proprietário deverá cadastrar um entregador de teste autorizado, compartilhar o link de instalação e pedir ao titular que faça Primeiro acesso. Conferir recebimento, link vencido/reutilizado, definição e confirmação de senha, login incorreto/correto, persistência, recuperação e bloqueio após desativar/reativar. Depois conferir escala, atribuição e entrega no ambiente escolhido. Este roteiro não foi executado sobre dados reais pelo agente.

# Acesso individual dos entregadores

Atualizado em 2026-10-23. Substitui o autocadastro com aprovação e o link de ativação por e-mail.

## Fluxo

1. A loja abre **Entregadores → Adicionar entregador** e informa nome e e-mail (o e-mail é o identificador). A loja nunca escolhe nem vê senha.
2. A loja envia o **link único e permanente** da loja: `/entregador/loja/<slug-da-loja>` (botões Copiar link, Compartilhar pelo WhatsApp, Abrir aplicativo).
3. O entregador abre o link (a loja aparece identificada) e entra com e-mail e senha.
4. Sem senha ainda (primeiro acesso) ou esqueceu a senha: toca em **Primeiro acesso ou esqueci minha senha**, informa o mesmo e-mail, recebe um **código de 6 dígitos** nesse e-mail, digita o código, cria e confirma a senha e entra direto no aplicativo. Não há aprovação nem ativação pela loja.
5. Próximos acessos: e-mail e senha.

O código é digitado na própria tela, então funciona também no app instalado (PWA), onde um link de e-mail abriria outro navegador.

## Segurança

- Código gerado com `crypto.randomInt`, guardado apenas como HMAC-SHA256 (chave `AUTH_SECRET`) em `VerificationToken`, válido por 10 minutos, uso único, descartado após 5 tentativas erradas; reenvio só após 60 s.
- Resposta pública idêntica para e-mail inexistente, suspenso ou de dono/equipe; nada é enviado nesses casos.
- Só contas exclusivamente de entregador, ativas e com perfil ativo em alguma loja recebem código. Operadores centrais da plataforma são excluídos.
- Definir a senha marca o e-mail como verificado e revoga as sessões anteriores em todas as lojas do entregador.
- Formulários com senha funcionam também antes do carregamento do JavaScript (envio POST pela ação do servidor); a senha nunca vai na URL.
- Sem `RESEND_API_KEY`, `MAIL_FROM` e `APP_PUBLIC_URL` (https), o primeiro acesso fica **fechado** e a tela explica; quem já tem senha continua entrando. Não há senha padrão, senha por texto nem token previsível.

## Gestão pela loja

- **Editar**: nome, telefone, veículo, placa, e-mail (trocar o e-mail exige nova confirmação por código).
- **Suspender / Reativar**: bloqueia o acesso só nesta loja e revoga as sessões dela.
- **Remover vínculo**: a conta deixa de acessar por esta loja; o perfil e as entregas ficam no histórico. Para trazer de volta, adicione o e-mail de novo.
- Entregadores antigos sem senha aparecem como **Aguardando primeiro acesso** e usam o mesmo fluxo de código; nenhum cadastro ou entrega é apagado.

## Várias lojas

A mesma conta pode trabalhar em várias lojas, com perfil independente em cada uma: a segunda loja cadastra o **mesmo e-mail**. Entrar pelo link de uma loja abre essa loja; no app há o seletor **Loja de trabalho**. Suspensão em uma loja não afeta as outras.

Requer a migração `20261023090000_driver_multistore` (troca o índice único global `Driver_userId_key` por `(organizationId, userId)`). Antes dela, cadastrar um e-mail que já trabalha em outra loja é recusado com mensagem clara; todo o restante funciona sem migração.

## Configuração externa pendente

Na Vercel (Production): `RESEND_API_KEY`, `MAIL_FROM` (remetente de domínio verificado no Resend) e `APP_PUBLIC_URL=https://adega-nine.vercel.app`. Documentação: https://resend.com/docs/api-reference/emails/send-email

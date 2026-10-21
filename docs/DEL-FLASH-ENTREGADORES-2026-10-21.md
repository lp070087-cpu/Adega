# Entregadores — convite da loja e escala compacta

Implementado sobre os vínculos existentes. Sem migração, concessão de privilégios, criação de dados reais ou envio real de e-mail nesta etapa.

## Convite por estabelecimento

Em `/app/entregadores`, **Copiar convite de entregador da loja** compartilha `/entregador/convite/[slug]`. O endereço mostra a loja e permite informar e-mail e escolher a própria senha. Somente um perfil de entregador ativo previamente cadastrado/aprovado pela loja, com usuário ativo e ativação pendente, é elegível. Não cria usuários ou vínculos. Proprietários, operadores centrais, identidades já ativadas e vínculos de outra organização são recusados com resposta pública genérica.

A senha fica pendente como hash bcrypt no identificador do registro temporário de verificação; nunca é guardada em texto puro ou ativada antes da confirmação. O token aleatório é armazenado como SHA-256, expira em 30 minutos e é consumido uma única vez. O token bruto fica no fragmento do link enviado por e-mail, não no GET ou logs do servidor. A tela remove o fragmento após lê-lo.

O entregador confirma o link recebido e então entra com o e-mail e a senha que escolheu. A confirmação revalida a loja, usuário, vínculo e perfil dentro da transação, invalida tokens anteriores e revoga sessões. Desativação, suspensão da loja ou promoção a operador central impedem a confirmação. Os fluxos antigos seguros de ativação, recuperação, lembrar sessão e mostrar senha são preservados.

Sem provedor configurado, a interface informa que **o convite continua pendente e o envio aguarda configuração**, sem simular envio nem solicitar outro cadastro. O envio depende de Resend, remetente verificado e URL HTTPS já previstos no servidor. Nenhum e-mail real foi enviado para validar esta etapa.

## Escala

Os sete dias começam recolhidos, com resumo de horário, situação e virada da madrugada. Um dia por vez pode ser aberto. **Salvar dia** valida a semana completa (incluindo sobreposição entre dias) e só recolhe após confirmação do servidor, mantendo os dados no modal e devolvendo o foco ao cabeçalho do dia. O botão final salva a semana e fecha. Dias sem turno indicam folga quando a restrição de escala está ativa.

## Verificação

- Cinco testes novos com mocks: convite/consumo/senha pendente; recusa de identidade não convidada; expiração/desativação/suspensão/promoção; falha realista de provedor; resumos e validação entre dias.
- 25 testes direcionados aprovados em conjunto com autenticação individual e escala anteriores.
- Não houve teste real de e-mail nem revisão visual de painel autenticado por esta frente. A validação conjunta de TypeScript/build e revisão de interfaces pertence à entrega consolidada.

## Teste manual posterior

1. Cadastrar um entregador de teste na organização autorizada e copiar o convite dessa loja.
2. Abrir o link, escolher uma senha e verificar que um e-mail não convidado não cria conta ou vínculo.
3. Após configuração do e-mail, receber o link; tentar ativar em outra loja deve falhar. Confirmar uma vez e entrar com a senha escolhida; repetir o link deve falhar.
4. Repetir com token expirado, entregador desativado e identidade vinculada a outra loja; conferir recusa sem alteração de senha.
5. Editar e salvar um dia da escala, conferir recolhimento/resumo/persistência; criar sobreposição e conferir erro com card aberto. Verificar madrugada, intervalo e dias de folga.

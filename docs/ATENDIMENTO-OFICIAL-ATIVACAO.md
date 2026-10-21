# Atendimento oficial — ativação controlada

## Estado entregue

Interface do estabelecimento em `/app/atendimento`; infraestrutura central em `/admin/servicos`. O cadastro público não concede acesso global. Operadores OWNER/ADMIN centrais são verificados no servidor e tokens não são retornados à interface. A ativação de `lp070087@gmail.com` continua pelo procedimento de `ADMIN-COMERCIAL-ATIVACAO.md`, exclusivamente após aprovação da migração central e confirmação da conta existente.

## Migração pendente

`web/prisma/migrations/20261020090000_assistant/migration.sql` cria somente AssistantChannel, AssistantThread e AssistantMessage. Inclui unicidade do número, vínculo organização/conversa, índices de consulta e chaves de mensagens para deduplicação. Não altera tabelas existentes nem remove dados. A chave composta da mensagem/conversa impede associação entre organizações.

Não foi aplicada. Antes de qualquer aplicação: aprovar explicitamente o destino, obter ponto de recuperação Neon, comparar nomes existentes e estado das migrações, testar o SQL em banco isolado e revisar todas as migrações pendentes. Não executar `migrate deploy` às cegas: ele aplicaria também outras migrações pendentes. O arquivo é transacional; uma falha antes do COMMIT desfaz a criação. Depois de dados reais, recuperação deve preservar as mensagens e preferir correção aditiva ou restauração revisada; não apagar tabelas como rollback automático.

## Configuração posterior à aprovação

1. Aplicar apenas as migrações aprovadas pelo procedimento revisado do projeto.
2. Configurar segredos no servidor: criptografia existente, aplicativo oficial Meta, segredo do aplicativo, token de verificação, versão Graph autorizada e URL pública HTTPS.
3. Configurar provedor IA com chave e modelo explicitamente escolhidos. Revisar custos e política de privacidade antes de ativar.
4. Ativar WHATSAPP_ASSISTANT_ENABLED somente após confirmar as três tabelas. A disponibilidade falha fechada se faltar estrutura.
5. No admin central, cadastrar organização, phone-number ID e token. A API oficial precisa confirmar o identificador; a interface nunca trata um valor digitado como conexão comprovada.
6. Configurar webhook oficial `/api/whatsapp/webhook`; GET valida desafio e POST valida HMAC do corpo original. Um evento assinado do número mapeado confirma o webhook antes da ativação do atendimento.
7. Configurar execução recorrente autenticada de POST `/api/jobs/assistant`, com Bearer ASSISTANT_JOB_TOKEN. O processamento manual por organização também está disponível. Não existe cron habilitado automaticamente.
8. A organização pode ativar IA somente com conexão verificada e serviço disponível.

## Limitações e garantias

Não usa WhatsApp Web, QR improvisado, templates não aprovados ou envio em massa. O atendimento automático responde apenas a mensagens recebidas dentro de janela conservadora de 23 horas. Mensagens antigas ou não textuais vão para atendimento humano. Descadastro fecha o atendimento automático. Histórico e mensagens permanecem separados por organização.

A IA seleciona IDs e necessidade de esclarecimento; preços, embalagens e links são compostos a partir do catálogo real. Caixa de 12 não é presumida. Não confirma compra nem altera estoque. O cliente conclui no checkout existente.

Recebimentos são deduplicados; envios possuem fila durável e limite diário. Respostas desconhecidas de envio ficam como UNCERTAIN e não são reenviadas automaticamente. Apenas falhas explicitamente recuperáveis podem ser reprocessadas pelo operador; isso evita prometer entrega de mensagem sem confirmação.

O Embedded Signup pelo próprio estabelecimento pertence à etapa complementar seguinte e não está habilitado nesta entrega. Nenhum token real, envio externo ou conexão Meta foi testado.

Referências: [Responses e saídas estruturadas](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), [Cloudinary Upload](https://cloudinary.com/documentation/upload_images).

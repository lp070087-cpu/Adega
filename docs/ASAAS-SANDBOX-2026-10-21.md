# Asaas — homologação protegida

Código preparado em 21/10/2026. Nenhuma chamada real ao Asaas, cobrança, cadastro de pagador ou mudança de contrato foi executada nesta etapa.

## Escopo entregue

- `/admin/asaas`, exclusivo OWNER/ADMIN/FINANCE; credenciais somente OWNER/ADMIN. Autorização consultada no servidor em todas as ações.
- Credenciais de Sandbox e Produção separadas, cifradas com AES-GCM pelo mecanismo existente. Não retornam ao frontend, auditoria ou logs.
- Consulta/localização de pagador por referência, criação explícita de assinatura Sandbox mensal de R$ 119,00, Pix ou boleto. Sem coleta de cartão nesta versão.
- Consulta das primeiras 100 cobranças por assinatura, suspensão, reativação e cancelamento definitivo no Sandbox com motivo, confirmação e auditoria. O cancelamento no Asaas remove cobranças pendentes/vencidas; os pagamentos anteriores ficam no provedor. O retrato local preserva a consulta anterior ao cancelamento.
- Webhook autenticado pelo header oficial `asaas-access-token`, limite de 64 KiB, deduplicação persistente por ambiente/evento e bloqueio transacional por contrato. O pagamento é consultado novamente na API; valores do payload recebido não confirmam pagamentos.
- Vínculos e registros de homologação ficam em chaves separadas de `PlatformSetting`; nenhum teste Sandbox grava `SaaSCharge`, receita real ou liberação de contrato.
- Uma tentativa de criação reserva seu vínculo antes da chamada externa. Timeout/erro não provoca nova criação automática. Estado inconclusivo requer conciliação administrativa no Asaas usando a referência `adega:sandbox:<contractId>`. Não apagar a reserva para repetir sem conferir o provedor.
- Nenhuma alteração de schema adicional nesta etapa. Depende da migração comercial de seis tabelas já preparada e ainda não aprovada.

## Ativação de homologação

1. Obter aprovação específica da migração comercial e concessão ao operador, seguindo `ADMIN-COMERCIAL-ATIVACAO.md`. Não usar deploy como autorização de migração.
2. Configurar chave de cifra existente no servidor e `ASAAS_ENABLED=true` apenas no ambiente aprovado. O Admin Central também precisa estar ativado.
3. Operador autorizado cadastra a chave da conta **Sandbox**, separada da conta real, e token próprio de webhook entre 32 e 255 caracteres sem espaços; não reutilizar a chave API como token.
4. No Sandbox Asaas, cadastrar URL HTTPS `/api/webhooks/asaas/sandbox`, token correspondente e eventos `PAYMENT_*` pertinentes. Preferir entrega sequencial.
5. Selecionar contrato mensal real de R$ 119,00 elegível, informar dados de pagador de teste e confirmar `CRIAR NO SANDBOX`. Não modifica preço acordado, contrato ou permissões existentes.
6. Conferir assinatura/cobranças no painel Sandbox, simular pagamento por ferramentas oficiais e conferir webhook/consulta. Reenviar o mesmo evento deve manter um único registro de processamento.
7. Conferir que financeiro real e acesso do estabelecimento não mudaram. Exercitar suspensão/reativação e cancelamento apenas de recorrência de teste.

## Limitações e próximos passos protegidos

- **Produção bloqueada no cliente HTTP para qualquer escrita e no endpoint de webhook.** Guardar chave não ativa cobranças. Go-live depende de homologação real, aprovação de cobranças e implementação/revisão da ativação financeira em produção.
- API Sandbox não foi executada: faltam credenciais e ativação aprovada do Admin Central. Testes foram com mocks.
- Não há coleta de cartão, cobrança de consumo externo, renovação manual que duplique recorrência, reabertura de assinatura definitivamente removida nem reconciliação automática de operação inconclusiva. Recorrência mensal é gerida pelo Asaas quando criada explicitamente no Sandbox.
- O cliente HTTP inclui consulta de QR Pix; a exibição e quitação Pix devem ser homologadas antes de disponibilização ao assinante. A página administrativa apresenta situação e valores consultados, não uma confirmação fictícia.
- A consulta administrativa lista até 100 cobranças. Paginação completa e conciliação operacional de históricos maiores precisam ser concluídas antes de expansão da operação.
- As cobranças de assinatura SaaS são independentes do pagamento dos pedidos do estabelecimento. Não habilitam pagamento online no checkout da loja.

## Referências oficiais consultadas

- https://docs.asaas.com/docs/sandbox
- https://docs.asaas.com/reference/criar-novo-cliente
- https://docs.asaas.com/reference/criar-nova-assinatura
- https://docs.asaas.com/reference/recuperar-uma-unica-assinatura
- https://docs.asaas.com/reference/obter-qr-code-para-pagamentos-via-pix
- https://docs.asaas.com/reference/remover-assinatura
- https://docs.asaas.com/docs/criar-novo-webhook-pela-aplicacao-web

## Recuperação

Desligar `ASAAS_ENABLED` interrompe as ações locais, preservando vínculos e auditoria. Isso não cancela uma recorrência já criada no provedor: a operação remota precisa ser conferida e encerrada por operador autorizado. Não apagar registros financeiros nem reservas inconclusivas. Chaves comprometidas exigem rotação aprovada no provedor e atualização protegida do cadastro.

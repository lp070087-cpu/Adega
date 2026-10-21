# Entrega operacional — 20/10/2026

## Implementado

- Configurações reúne Minha Loja; a rota antiga redireciona e as permissões continuam no servidor.
- Entregadores: instalação PWA e link compartilhável, escala semanal com múltiplos turnos, intervalos e madrugada; aviso persistido do próximo dia atualizado ao consultar/polling. Disponibilidade e atribuição consideram turno e entregas em andamento; troca antes da coleta exige motivo e preserva histórico.
- Estoque: padrão configurável 25/5 para novos produtos controlados. Inicialização existente tem seleção, prévia, preservação de saldo/histórico e confirmação. Ajustes são transacionais e identificam responsável/motivo.
- Fotos: seleção de arquivo, prévia, troca e remoção; biblioteca continua como fallback. Upload persistente Cloudinary condicionado a configuração, validação de assinatura real do arquivo e autorização. Não usa disco local como armazenamento definitivo.
- Caixa: campo monetário editável em pt-BR, separação dinheiro/Pix/cartões, passagem de responsabilidade com encerramento, conferência independente e aceite pelo destinatário. Não altera lançamentos antigos.
- Campanhas: configuração, elegibilidade, opt-out, limites, validade e cupom integrado ao checkout no servidor. Turbo requer loja aberta, entregador livre em turno e confirmação operacional. Não envia mensagens em massa.
- Pontos: seção própria, desativada por padrão, crédito idempotente ao concluir, estorno ao cancelar, consulta por recibo e resgate manual confirmado. Desativar preserva histórico.
- Plano comercial: Adega Completo R$119/mês na oferta e ação central explícita; contratos e cobranças existentes preservados. Custos externos são separados.
- Atendimento IA: interface por loja, catálogo verdadeiro, links de produto, transferência humana, histórico, fila, limites, assinatura HMAC e deduplicação. Infraestrutura e credenciais são administradas centralmente, com proteção no servidor.
- Loja: produto pausado e saldo zero têm mensagens distintas. Loja fechada permite montar sacola, mas não concluir pedido. Links de produto/variante são validados contra o catálogo da própria loja; recibo mostra benefício/frete efetivos.

## Ativação pendente

Não houve escrita de teste no Neon, criação de cobrança, inicialização real de estoque ou mudança de senha. Admin global depende da migração central aprovada e do procedimento existente para a conta `lp070087@gmail.com`. Não foi concedido privilégio.

WhatsApp depende da migração aditiva de três tabelas, Meta oficial, credenciais, confirmação do número/webhook, IA configurada e agendador do endpoint protegido. Desativado por padrão; detalhes em ATENDIMENTO-OFICIAL-ATIVACAO.md. Upload real depende das credenciais Cloudinary. Push não está habilitado. Avisos de escala são internos, gerados na consulta, sem promessa de envio em segundo plano.

## Validação executada

- 123 testes automatizados passaram, com mocks/dados isolados: autorização, isolamento, checkout, estoque, caixa, pontos, campanhas, entregadores, PWA, webhook e catálogo.
- Prisma validate: aprovado. Prisma generate: executado localmente, sem aplicar schema ao banco.
- Build Next.js: aprovado, incluindo compilação, checagem de tipos e geração das páginas.
- Revisão visual autenticada e compras/entregas reais: não executadas nesta etapa. Testes com mocks não equivalem a E2E.

## Roteiro do proprietário

1. Com conta autorizada, revisar Minha Loja, horários, retirada/entrega e mensagens de disponibilidade.
2. Conferir prévia da inicialização antes de confirmar qualquer saldo na loja de testes; preservar produtos com histórico.
3. Cadastrar entregador, escala e consultar o aplicativo com credenciais próprias. A ativação individual por e-mail será entregue na etapa complementar posterior.
4. Em ambiente escolhido pelo proprietário, realizar compra, repetir clique, preparar, atribuir, iniciar e concluir entrega; conferir status, estoque e caixa.
5. Abrir caixa com troco, registrar vendas e propor passagem; o novo operador confere e aceita ou recusa. Conferir trilha dos dois turnos.
6. Ativar campanha/pontos apenas com condições reais; conferir desconto no recibo e crédito/estorno sem repetição.
7. Depois da configuração aprovada, validar upload e WhatsApp oficial com número autorizado. Não tratar “Aguardando conexão” como conectado.

## Sequência

A etapa mobile premium e, depois, o primeiro acesso individual dos entregadores continuam pendentes conforme CONTINUIDADE-OPERACIONAL-2026-10-20.md. Esta entrega não declara o SaaS integralmente validado para produção real.

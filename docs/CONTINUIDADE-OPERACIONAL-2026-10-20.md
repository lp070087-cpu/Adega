# Continuidade — 20/10/2026

## Ordem autorizada

1. Concluir, validar e publicar a etapa operacional (caixa, estoque, entregadores, campanhas, pontos, plano e atendimento).
2. Depois executar mobile premium, banners por categoria e conexão oficial do WhatsApp por estabelecimento.
3. Depois executar primeiro acesso individual dos entregadores com ativação por e-mail, recuperação e sessão segura.

As etapas 2 e 3 foram solicitadas como complementos sequenciais. Não devem ser declaradas concluídas pelo relatório da etapa 1.

## Proteções

Não aplicar migrações no Neon, seeds, alteração de senhas existentes, concessão de privilégios centrais, inicialização de estoque ou pedidos reais de teste. Publicação de código validado está autorizada. Testes reais de compra e entrega serão feitos pelo proprietário.

## Etapa operacional

Implementados: Minha Loja dentro de Configurações com redirecionamento; estoque padrão configurável 25/5 e inicialização explícita; upload Cloudinary condicionado a credenciais; escala semanal e disponibilidade; PWA e compartilhamento; reatribuição auditada; passagem de caixa; campanhas e cupom calculado no checkout; pontos com estorno; oferta Adega Completo R$119 sem alterar contratos; atendimento oficial com fila persistida, assinatura de webhook, catálogo real e transferência humana.

Documentos específicos: OPERACAO-COMERCIAL-2026-10-20.md, ESTOQUE-UPLOAD-2026-10-20.md e ENTREGADORES-ESCALAS-PWA.md.

123 testes com mocks passaram. TypeScript passou. Schema Prisma validado e cliente gerado localmente. Build em validação; registrar resultado antes de publicar.

## Dependências de ativação

- Migração central de seis tabelas continua pendente de aprovação; procedimento de proprietário existente deve ser seguido, sem autorização por e-mail no frontend.
- Migração 20261020090000_assistant cria três tabelas, índices e relacionamentos; não foi aplicada. WHATSAPP_ASSISTANT_ENABLED permanece desativado por padrão e evita consultas às novas tabelas.
- WhatsApp exige aplicativo oficial Meta, versão Graph configurada, credenciais, número verificado e webhook assinado; IA exige chave/modelo explícitos; processamento recorrente exige agendador autorizado para o endpoint protegido. Nenhuma conexão externa foi simulada.
- Upload exige armazenamento persistente Cloudinary configurado no servidor. Não foi testado upload real.
- Plano R$119 precisa ser publicado explicitamente pelo admin global após sua ativação. Nenhuma cobrança foi criada.
- Estoque existente só é alterado por confirmação administrativa explícita, com prévia e histórico.

## Próximos complementos ainda pendentes

Mobile em todas as larguras pedidas, screenshots, cards sem borda, expansões por categoria, banners mobile administráveis e onboarding oficial Meta. Depois, ativação individual de entregador com token temporário de uso único, envio real por serviço configurado, login e recuperação sem modificar senhas de contas existentes.

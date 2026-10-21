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

123 testes com mocks passaram. TypeScript passou. Schema Prisma validado e cliente gerado localmente. Build aprovado. Commit 6ba8987 publicado em main; Vercel confirmou Deployment has completed.

## Dependências de ativação

- Migração central de seis tabelas continua pendente de aprovação; procedimento de proprietário existente deve ser seguido, sem autorização por e-mail no frontend.
- Migração 20261020090000_assistant cria três tabelas, índices e relacionamentos; não foi aplicada. WHATSAPP_ASSISTANT_ENABLED permanece desativado por padrão e evita consultas às novas tabelas.
- WhatsApp exige aplicativo oficial Meta, versão Graph configurada, credenciais, número verificado e webhook assinado; IA exige chave/modelo explícitos; processamento recorrente exige agendador autorizado para o endpoint protegido. Nenhuma conexão externa foi simulada.
- Upload exige armazenamento persistente Cloudinary configurado no servidor. Não foi testado upload real.
- Plano R$119 precisa ser publicado explicitamente pelo admin global após sua ativação. Nenhuma cobrança foi criada.
- Estoque existente só é alterado por confirmação administrativa explícita, com prévia e histórico.

## Próximos complementos ainda pendentes

Mobile em todas as larguras pedidas, screenshots, cards sem borda, expansões por categoria, banners mobile administráveis e onboarding oficial Meta. Depois, ativação individual de entregador com token temporário de uso único, envio real por serviço configurado, login e recuperação sem modificar senhas de contas existentes.

## Complemento mobile em andamento

Cards sem borda e expansão de 12 produtos por categoria implementados; posições hero-mobile e transition:categoria reutilizam StoreBanner sem migração. Gerenciamento e escopo por loja implementados. Três artes SVG editáveis com fotografias exatas do acervo disponíveis para escolha, sem associação automática. Ajustes de largura, texto, controles e hero mobile preparados. Aba WhatsApp em Configurações mostra estado real; Embedded Signup permanece indisponível e ainda depende de implementação/homologação oficial, além da configuração Meta.

126 testes passaram; TypeScript passou. Build aprovado. Navegador local não conecta, navegador de produção funciona. Consulta somente de leitura confirmou a conta proprietária existente/ativa e a loja atual `/loja/loja-0102`; o slug anterior não existe. Nenhum privilégio foi concedido. Revisão visual pós-publicação e screenshots por largura ainda pendentes. Primeiro acesso individual dos entregadores ainda não iniciado para respeitar a sequência solicitada.

Atualização: mobile publicado no commit 78bbb36, Vercel confirmado. Vitrine testada nas oito larguras pedidas, sem overflow, com capturas; expansão/recolhimento e sacola/abertura de checkout em390 testados sem enviar pedido. Detalhes e limitações em MOBILE-BANNERS-2026-10-20.md. Telas autenticadas e Embedded Signup continuam pendentes. Iniciando agora o complemento de acesso individual dos entregadores.

## Complemento de acesso individual implementado, aguardando validação final

Cadastro exige e-mail e prepara conta DRIVER sem senha administrativa; edição protege conta de outra organização/operador central e exige reativação por e-mail. Primeiro acesso e recuperação em `/entregador/acesso` usam token aleatório de uso único, SHA256 e validade de30min; envio Resend condicionado a configuração, sem envio real pelo agente. Login possui olho SVG, manter conectado (7dias; padrão8h), preserva usernames antigos e login normal proprietário/admin. Desativação registra revogação persistente de sessão. Atribuição/disponibilidade rejeitam acesso ainda não ativado. Onboarding mantém a trava existente e também bloqueia vínculo DRIVER desativado.

141 testes completos passaram. TypeScript final aprovado (saídas0 nas sessões47394 e32921). Build final aprovado (saída0 na sessão20483). Etapa individual pronta para commit/publicação sobre78bbb36; registrar hash e confirmação Vercel depois do push. `web/Banneres public/` continua fora do Git. Documentação em ACESSO-INDIVIDUAL-ENTREGADORES.md. Não executar testes reais de e-mail, login ou entrega com dados de produção; apenas revisão visual sem submissão e mocks.

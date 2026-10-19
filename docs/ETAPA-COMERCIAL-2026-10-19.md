# Administração comercial e visual — entrega e continuidade

Base confirmada: `3667da2` em `main`, repositório Adega; aplicação em `web/`.
Nenhum AGENTS.md localizado. Foram usadas três frentes auxiliares reais,
com coordenação principal, distribuindo as doze especialidades. Não havia
skills específicas instaladas de arquitetura Next.js/Prisma/comercial;
nenhuma skill ou execução de agente inexistente foi alegada.

## Implementado

1. **Admin central:** `/admin`, login próprio e dez seções: dashboard,
   estabelecimentos, planos, assinaturas, financeiro SaaS, integrações,
   usuários/operadores, suporte, configurações e auditoria.
2. **Autorização global:** PlatformOperator separado de OrganizationUser.
   Nem OWNER de loja nem o papel legado PLATFORM_ADMIN concedem acesso
   central. Papéis centrais OWNER/ADMIN, FINANCE e SUPPORT têm escopos
   distintos. Ações sensíveis exigem confirmação, motivo e auditoria.
3. **Planos e assinaturas:** Plan reutilizado, mensal/anual opcional,
   descrição, recursos, limites, ativação e edição. Contrato comercial
   único por organização, situação, datas, teste, carência, renovação e
   troca de plano. Valor contratado preservado; recálculo explícito.
4. **Financeiro SaaS:** cobranças internas por competência, valor obtido do
   contrato, vencimento, recebimento manual confirmado e cancelamento de
   pendentes; recebidos não podem ser recebidos ou cancelados novamente.
   Receita contratada e recebida são separadas. MRR normaliza valor anual
   em doze meses; recebidos são somente PAID no período de São Paulo.
5. **Integrações centrais:** menu removido dos estabelecimentos; rota
   anterior informa a nova administração. Ações antigas agora exigem
   operador global. Configuração seleciona organização, cifra novas
   credenciais, preserva anteriores, não revela texto puro e registra
   auditoria. Desconectar preserva credenciais/eventos. Não há botão para
   inventar conexão ACTIVE nem novos adapters externos.
6. **Limites comerciais:** usuários/equipe e entregadores verificados no
   servidor, dentro da mesma transação da criação/reativação. Mudança de
   plano nunca desativa cadastros existentes. Sem ativação e sem contrato,
   as organizações legadas continuam funcionando.
7. **Situação comercial:** restrição opcional de novos pedidos, com carência
   e aviso. Não bloqueia processamento, consulta ou entrega de pedidos
   existentes. Organizações sem contrato não são suspensas automaticamente.
8. **Conta do estabelecimento:** `/app/assinatura` consulta somente seu
   contrato/cobranças; fallback para Subscription legado. Selecionar plano
   envia solicitação ao suporte, sem fabricar contratação ou recebimento.
9. **Painel:** SVGs Lucide em navegação e indicadores, hierarquia visual,
   tabelas, campos, cards e modais refinados; foco acessível, estilos
   separados da loja. Textos de Minha Loja com acentuação reparada.
10. **Loja pública:** referência `site.html` e `ad8d5e9` consultadas; hero
    amplo, imagem de fundo/overlay, dois botões, destaques flutuantes,
    carrossel dinâmico, menu, categorias e vitrine central. Cards em quatro
    colunas desktop, três tablet e duas em celular; desconto real e preço
    original riscado, fotografia sem esticar/cortar e sacola preservada.
11. **Fotos:** manifest de 42 correspondências exatas fisicamente presentes
    em public/catalog, sem heurística entre marcas/volumes. Prioridade de
    imagem própria/global preservada. Duas fotos aprovadas copiadas do
    acervo para Brahma Litrão 1L e Litrinho 300ml, sem alterar pixels.
    Litrinho tem resolução original limitada, com vínculo explícito no
    loja-data.js aprovado. Skol Lata350 não foi localizada entre os 111
    arquivos únicos inspecionados. Não foi substituída por Skol Zero ou
    outra embalagem. Arquivos legados Original350 mostrando473 e Lacta
    Shot40g mostrando80 foram excluídos da resolução, sem apagar o acervo.
12. **Preservação:** checkout, estoque transacional, caixa, idempotência,
    entregas, Auth.js, dados Neon e biblioteca global mantidos. Os quatro
    banners PNG originais foram preservados e continuam dependentes dos
    registros dinâmicos, sem vincular banners de outra organização.

## Validação e limites

Suíte automatizada: 70 testes passaram na execução consolidada. Inclui
módulos reais de ações e autorização com imports/DB
simulados. Não é E2E PostgreSQL, sessão real de operador ou pagamento real.
Schema Prisma validado; Prisma Client gerado localmente, sem migração.
Build final e typecheck final aprovados, sem desativar verificações.

Por execução local da versão compilada: loja pública respondeu HTTP 200;
`/admin` e `/app/dashboard`, `/app/catalogo`, `/app/pedidos` sem sessão
responderam 307 para login. Nenhum login, pedido ou cadastro foi enviado.
O navegador local e de produção teve timeout; isso não certifica responsividade visual.
Revisão gráfica de produção e resultado do deploy são registrados na
conversa após publicação. Sem credenciais ou autorização global concedida,
as telas autenticadas centrais não foram exercitadas em sessão real.

## Dependente de aprovação/ativação

- Aplicar a migração aditiva de seis tabelas, após backup e ensaio isolado.
- Autorizar o User.id existente que será o primeiro OWNER central e auditar
  a concessão; não há bootstrap público, e nenhum privilégio foi concedido.
- Ativar PLATFORM_ADMIN_ENABLED somente depois das etapas acima.
- Ativar bloqueio comercial separadamente, por flag global e por contrato;
  nenhum bloqueio novo foi aplicado às lojas existentes nesta execução.
- Executar testes E2E em banco isolado e sessão de operador autorizado.
- Upload remoto, recuperação por e-mail e gateways externos dependem dos
  serviços reais; nada foi apresentado como conectado nesta entrega.
- Falta fotografia exata de Skol Lata350; fallback SVG é intencional.

Procedimento e impacto revisáveis em `docs/ADMIN-COMERCIAL-ATIVACAO.md` e
`docs/LIMITES-COMERCIAIS.md`. A migração não altera tabelas/colunas legadas,
é transacional, inclui FKs e CHECKs; não foi aplicada ao Neon. Não usar
migrate deploy sem avaliar baseline do banco preexistente. Não executar
seed, db push, reset, limpeza ou concessões sem autorização explícita.

## Publicação e retomada

Publicar somente código validado e funções novas protegidas por padrão.
Não incluir `.env`, `.next`, node_modules ou `web/Banneres public/`.
Na pasta web executar `npm test`, `npm run build` e `npm run typecheck`
sequencialmente ao final, evitando dev/build reescrever tipos simultâneos.
Conferir status/diff/remoto, commit e push sem force. Confirmar Vercel pelo
status do hash publicado; push sozinho não prova deploy concluído.

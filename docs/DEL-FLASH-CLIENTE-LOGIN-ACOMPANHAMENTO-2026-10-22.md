# Cadastro/login do cliente, acompanhamento de pedidos e loja de bebidas — 22/10/2026

Base: `5b2f01c`. Nenhuma operação no Neon de produção, nenhuma migração aplicada em produção, nenhuma alteração de permissões.

## 1. Tipo de negócio — somente Loja de bebidas

- Minha Loja › Identidade: campo fixo "Loja de bebidas" (sem seletor). Salvar a identidade grava `BEVERAGE`.
- Servidor: todos os schemas de onboarding e de atualização normalizam `businessType` para `BEVERAGE` (`beverageBusinessTypeSchema`).
- Onboarding: passo 1 mostra apenas Loja de bebidas; rascunhos antigos também viram bebidas.
- Vitrine/painel/catálogo-modelo usam sempre os textos e o modelo de bebidas. O enum do banco e registros antigos não foram alterados.

## 2. Conta do cliente (rotas `/loja/[slug]/conta/...`)

- Cadastro: nome completo, e-mail, telefone/WhatsApp com máscara brasileira, senha + confirmação com mostrar/ocultar, aceite dos termos (`/conta/termos`, registrado em `termsAcceptedAt`), manter conectado.
- Senhas com bcrypt; sessões com token aleatório guardado como hash, cookie HttpOnly por loja (`path=/loja/<slug>/`), 30 dias com "manter conectado" ou sessão do navegador sem ele.
- Sem provedor de e-mail: a conta é criada e o cliente entra na hora; e-mail duplicado na mesma loja é recusado. Com provedor (`RESEND_API_KEY`, `MAIL_FROM`, `APP_PUBLIC_URL` https): confirmação de e-mail obrigatória, resposta igual para e-mail novo/existente.
- Recuperação: token único, 30 min, uso único, invalida sessões. Sem provedor, a tela informa a indisponibilidade real e a configuração necessária; nenhum envio é simulado. Sem enumeração de contas.
- Retorno ao checkout: links "Entrar/Criar conta" no checkout usam `?voltar=checkout`; após autenticar o cliente volta para `/loja/<slug>/?finalizar=1`, que reabre a finalização com a sacola (localStorage) preservada. Destinos de retorno só dentro da mesma loja.
- Minha conta: dados, telefone, endereços, histórico com acompanhamento visual, alteração de senha, sair. Troca de e-mail só com provedor configurado.
- Isolamento: conta por loja (mesmo e-mail em outra loja = outra conta), consultas sempre por conta + organização. Cliente não recebe papéis de equipe.
- Correção: formulários do cliente não apagam mais o que foi digitado quando o servidor recusa o envio (React 19 limpava o formulário).

## 3. Acompanhamento do pedido

- `src/lib/order-tracking.ts` deriva as etapas apenas de `Order.status`, timestamps e `Delivery.status` — sem status paralelo.
- Entrega: Aceito → Separando → Saiu para entrega → Finalizado. Retirada: Aceito → Separando → Pronto para retirada → Finalizado.
- Antes do aceite: "Aguardando confirmação da loja". Cancelado: mostra só as etapas realmente alcançadas, nunca "Finalizado". Falha de entrega (pedido volta para separação): aviso de nova tentativa.
- Página `/loja/[slug]/pedido/[id]`: número, loja, itens, totais, modalidade, endereço, pagamento, status, horários, histórico, primeiro nome do entregador quando em rota/entregue, tempo médio informado pela loja (não apresentado como previsão exata).
- Atualização automática a cada 10 s com a aba visível, ao voltar o foco e ao reconectar.
- Identidade visual azul Del Flash (`#087ea4`/`#0b1f3a`); a cor da loja aparece só como acento (selo/ponto da loja).

## Migração pendente de aprovação (não aplicada em produção)

1. `web/prisma/migrations/20261021180000_customer_portal/migration.sql` (já documentada em 21/10).
2. `web/prisma/migrations/20261022120000_customer_portal_terms/migration.sql`: `ADD COLUMN IF NOT EXISTS "termsAcceptedAt"` — aditiva e idempotente.

Validação feita em Postgres 16 local isolado: schema base + as duas migrações resultam em diferença zero contra `schema.prisma`; a segunda é reexecutável.

Ativação: a área do cliente liga sozinha quando as cinco tabelas + a coluna existirem. `CUSTOMER_PORTAL_ENABLED=false` continua como desligamento de emergência (se essa variável estiver como `false` na Vercel, removê-la ou mudar após a migração). Procedimento de aplicação igual ao do documento de 21/10, executando os dois arquivos em ordem e depois `prisma migrate resolve --applied` para cada um.

## Testes

- `npm run typecheck`, `npm test` (243/243), `npx prisma validate`, `npm run build`: aprovados.
- Navegador (Playwright/Chromium) contra build de produção local + banco isolado, lojas "Del Flash Teste" e "Loja de Bebidas Teste", sem e-mail configurado:
  - cadastro inválido (senhas diferentes, telefone inválido) e válido; máscara; mostrar/ocultar; volta ao checkout aberto com a sacola preservada;
  - pedido criado logado e vinculado ao histórico; rota protegida após sair; senha errada e correta; cookie de sessão vs. 30 dias; isolamento entre lojas; conta duplicada recusada; link de acompanhamento sem dados da conta; recuperação indisponível sem envio fictício;
  - dono aceita/separa/conclui separação, entregador fica disponível, expedição atribui, entregador: cheguei na loja → retirei → iniciei a rota → cheguei ao cliente → confirmar entrega; a página do cliente atualizou sozinha em cada mudança (Aceito, Separando, Saiu para entrega, Pedido entregue) e o histórico mostrou o pedido finalizado;
  - retirada (Pronto para retirada → Pedido retirado) e cancelamento com motivo (Pedido cancelado);
  - celular 390 px e desktop 1280 px sem rolagem horizontal.

## Pendências reais

- Aprovação e aplicação acompanhada das duas migrações no Neon de produção.
- Provedor de e-mail em produção (para confirmação de e-mail, recuperação e troca de e-mail).
- Teste em produção após a migração, com dispositivo real.

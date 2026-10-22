# Finalização, responsividade, rede lenta e publicação — 22/10/2026

## Correções feitas nesta etapa

- **Bloqueador de produção corrigido:** a página de acompanhamento consultava `CustomerPortalOrder` (tabela inexistente antes da migração). Agora só consulta quando a área do cliente está ativa.
- **Acompanhamento:** algumas atualizações de página eram abortadas e o cliente ficava com status antigo. Agora consulta um JSON mínimo (`/api/loja/[slug]/pedido/[id]`, ~100 bytes) e só atualiza a tela quando o status muda, com reconferência em 2,5 s e recarga completa como garantia.
- **Checkout:** o React limpava o formulário quando o envio falhava (o cliente redigitava tudo e o reenvio era bloqueado). Corrigido no checkout, pedido manual da loja, login do entregador e campanhas/pontos.
- **Sem conexão:** aviso no topo da tela (não cobre botões); mensagem clara no checkout; reenvio reutiliza a chave de idempotência (não duplica pedido).
- **Vitrine em celular:** cabeçalho quebrava em duas linhas com "Entrar/Criar conta" sobre o banner; agora só o ícone abaixo de 640 px. Menu do cliente não sai da tela em 320 px.
- **Área do cliente desativada:** "Entrar/Criar conta" não aparece enquanto o cadastro não estiver ativo; checkout mostra "Compra sem cadastro".
- **Mobile geral:** `viewport-fit=cover` + safe areas (notch/barra inferior), inputs a 16 px no celular (sem zoom do Safari), botões de fechar 40 px, painéis com `dvh`, indicadores em 2 colunas a partir de 340 px, busca de pedidos em largura total.
- **Fonte:** Poppins de 7 para 5 pesos (menos download).
- **Animação financeira:** `AnimatedMoney` (contagem 750 ms, easing, formato `R$ 1.250,00`, largura reservada, valor real para leitor de tela, respeita movimento reduzido, não reinicia se o valor não muda). Aplicado em Visão geral (faturamento, ticket médio, caixa do turno), Vendas (faturamento, ticket médio, taxas, descontos) e Caixa (vendas do turno, dinheiro em gaveta). **Nunca em estoque** (teste automatizado garante).
- Microinterações: toque em botões, realce discreto em cards; tudo desligado com movimento reduzido.

## Testes executados

- `tsc`, `npm test` (245/245), `prisma validate`, `next build`: aprovados.
- **Cópia exata do schema de produção** (412 colunas, mesmo hash de tipos/nulidade que o Neon de produção, sem as 5 migrações): todas as páginas públicas, painel (21 rotas) e entregador sem erro 5xx; pedido de convidado; acompanhamento; aceite → separação → expedição → entregador → entrega com o cliente atualizando sozinho. Nenhum erro no servidor.
- **Banco com as migrações (isolado):** cliente 22/22 (cadastro, login, manter conectado, recuperação indisponível sem provedor, isolamento, sacola, histórico); fluxo de entrega completo; retirada; cancelamento; vínculo de entregador (link da loja → 2 solicitações → aprovar uma, rejeitar outra → aprovado trabalha em 2 lojas, rejeitado não vê a loja).
- **Responsividade:** 1.230 combinações (43 páginas × 10 larguras: 320, 360, 375, 390, 412, 430, 480, 768, 1024, 1440) + páginas com pedidos ativos em 320/360/412/768 + paisagem 844×390: nenhum transbordo horizontal restante, nenhum erro.
- **Rede lenta (3G emulado 400 kbps/400 ms):** vitrine utilizável em ~2,0 s, CLS 0,001; envio offline não cria pedido e mostra aviso; 3 toques em "Enviar pedido" no 3G criam exatamente 1 pedido; acompanhamento offline mostra aviso e retoma ao reconectar.

## Pendências reais (dependem de autorização/configuração)

- Migrações `20261021180000_customer_portal`, `20261022120000_customer_portal_terms`, `20261021210000_driver_applications` no Neon de produção (`delivery-platform` / `production` / `neondb`), com snapshot antes (não existe nenhum).
- Variáveis em Production: `RESEND_API_KEY`, `MAIL_FROM`, `APP_PUBLIC_URL`, `DRIVER_APPLICATIONS_ENABLED=true`.
- Sem essas etapas, em produção: a loja e as entregas funcionam; o cliente compra sem cadastro e acompanha pelo link; cadastro de cliente e solicitação de vínculo de entregador ficam ocultos/desligados.
- Testes em aparelhos físicos iPhone/Android não foram feitos (emulação Chromium com viewport, toque e modo móvel).

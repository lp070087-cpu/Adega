# Del Flash — Finalização operacional, integrações e redesign (26/10/2026)

Referência funcional: FrontZapp (atendimento). Identidade azul do Del Flash preservada; Biblioteca Unitrix usada só como referência visual, sem alterações.

## 1. WhatsApp / Atendimento
- Caixa de entrada em 3 colunas (conversas · chat · painel do cliente), com busca, filtros (todas, não lidas, IA, atendente, encerradas) e contador de não lidas.
- Etiquetas e notas internas por conversa. Painel do cliente com os últimos pedidos.
- Assumir (pausa a IA), devolver para a IA, transferir para alguém da equipe da mesma loja, encerrar e "Criar pedido" a partir da conversa.
- Mensagens que não são texto (foto, áudio, documento, localização) aparecem com um rótulo, sem quebrar o chat. Atualização automática por consulta de versão.
- A IA responde "onde está meu pedido" com o pedido real (últimos 3 dias, pelo telefone), usando a mesma etapa que o painel mostra. Catálogo, preços, estoque e horário também vêm dos dados reais; ela não inventa.
- **Canais:**
  - API oficial da Meta (Cloud API): webhook com verificação `hub.challenge` e assinatura `X-Hub-Signature-256`.
  - **WhatsApp Web:** aparece como **Indisponível**, com o motivo: automação não oficial viola os termos e pode bloquear o número.
- **Produção:** não há variáveis `WHATSAPP_*` e há 0 números conectados. O webhook responde 503. **Não está ativo.**

## 2. Mercado Pago (por loja)
- Em Configurações → Pagamentos, a loja escolhe Asaas ou Mercado Pago e informa o Access Token e a assinatura secreta do webhook. Ficam cifrados no servidor.
- **Pix:** `/v1/payments` com `X-Idempotency-Key` por pedido; QR Code e copia e cola.
- **Cartão:** Checkout Pro (preferência), sem dado de cartão no Del Flash.
- **Webhook** `/api/webhooks/pedidos/mercadopago/<loja>`:
  - valida `x-signature` (HMAC-SHA256 do manifesto `id;request-id;ts`, janela de 15 min);
  - relê o pagamento na API e confere pedido, loja e valor;
  - aplica pendente/aprovado/recusado/estornado uma única vez (eventos duplicados não repetem efeito).
- **Sandbox obrigatório:** só tokens `TEST-` enquanto `ORDER_PAYMENTS_PRODUCTION` não for `true`. Nenhuma cobrança real foi feita.

## 3. Fiscal (NFC-e)
- **Perfil fiscal da loja:** CNPJ, IE, regime, endereço, NCM/CFOP padrão, CST/CSOSN e origem. O sistema lista exatamente o que falta.
- Adaptador **Focus NFe**, em **homologação**:
  - emitir (só pedido pago), consultar e cancelar (justificativa de 15 a 255 caracteres);
  - guarda chave, protocolo, XML e DANFE devolvidos pelo provedor;
  - mostra a rejeição da SEFAZ com o motivo.
- **Produção bloqueada** até `FISCAL_PRODUCTION=true`. A tela diferencia "documento autorizado" de "PDF/recibo". Nenhum documento fictício é emitido.
- **Falta, para emitir de verdade:**
  - conta no provedor e token;
  - certificado A1 e CSC cadastrados no provedor;
  - IE ativa;
  - homologação concluída.

## 4. Área do cliente
Menu da conta (Pedidos, Endereços, Perfil e segurança…): recolhível no celular e coluna lateral a partir de 900 px. Cards de produto e sacola não mudaram.

## 5. Frete por faixas
- Adicionar, editar, remover e ordenar faixas.
- Recusa sobreposição, faixa inválida e valor negativo.
- Cada pedido usa exatamente uma faixa, e o cálculo é feito no servidor.
- A distância é chamada de "pelas ruas" só quando vem do serviço de rotas; senão a tela informa "em linha reta".
- Testes cobrem os limites exatos de cada faixa.

## 6. Fluxo do pedido
- **Etapas:** Recebido → Aceito → Em separação → Pronto para retirada → Retirado → Em entrega → Entregue.
- **Aceite:** manual ou automático. A separação tem cronômetro visível; o padrão é 10 min, ajustável na Central de Pedidos.
- **Entregador:**
  - a loja escolhe o entregador já no aceite ou na separação, e o pedido aparece no app como "Aguardando liberação";
  - "Pronto · liberar retirada" libera a retirada;
  - o entregador toca "Confirmar retirada" e depois "Ir para entrega", que abre a navegação; por fim, confirma a entrega.
- **Servidor:**
  - recusa transições inválidas e retirada antes da liberação;
  - checa permissões;
  - ignora cliques duplicados.

## 7. App do entregador
- **Mapa:**
  - nova tentativa quando o mapa falha ao carregar;
  - aviso quando as ruas (tiles) não carregam, com paradas e Google Maps/Waze ainda disponíveis;
  - sem GPS, centraliza na loja ou nas paradas.
- **Teste e2e `drivermap`** (Pixel 7):
  - abre com e sem permissão de localização;
  - mostra o aviso com os tiles bloqueados;
  - abre a navegação em tela cheia.
- **Cartões:** endereço em destaque e botões grandes de etapa.
- **Privacidade:** a localização contínua do entregador não é exposta à loja.

## 8. Painel
- **Produtos:**
  - busca e filtros em grade;
  - foto proporcional, preço e estoque visíveis;
  - um único selo de situação (Na vitrine, Sem estoque, Pausado, Inativo; mais Destaque e Repor);
  - "Editar" fica à vista; ativar/desativar, disponível/indisponível, duplicar e excluir ficam no menu "Mais".
- **Entregadores:** "Nova senha temporária" e "Remover vínculo" foram para o menu "Mais", e o selo repetido de "aguardando primeiro acesso" saiu.
- **Configurações agrupadas:** Visão geral, Loja, Entregas e frete, Pagamentos, Fiscal, WhatsApp e IA, Equipe e Plano.

## Pendências externas (não marcadas como ativas)
1. **WhatsApp:**
   - variáveis `WHATSAPP_ASSISTANT_ENABLED`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` e `WHATSAPP_GRAPH_VERSION`;
   - número oficial conectado;
   - URL do webhook no app da Meta;
   - `OPENAI_API_KEY` para a IA.
2. **Mercado Pago:**
   - credenciais da loja;
   - teste em sandbox pela loja;
   - `ORDER_PAYMENTS_PRODUCTION=true` após a homologação.
3. **Fiscal:**
   - conta Focus NFe, certificado A1, CSC e IE;
   - homologação;
   - `FISCAL_PRODUCTION=true`.
4. **Rotas pelas ruas:** `ROUTING_PROVIDER` + `ORS_API_KEY` (ou um OSRM próprio).
5. **E-mail:** `RESEND_API_KEY`.
6. **Loja `loja-0102`:** cidade/UF inválidas em produção, para o dono corrigir.

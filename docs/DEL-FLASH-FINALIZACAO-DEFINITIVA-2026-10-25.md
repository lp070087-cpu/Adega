# Del Flash — Finalização definitiva (25/10/2026)

## O que foi entregue

### Visual
- **Área do cliente:** menu da conta virou uma barra única no celular e uma coluna fixa à esquerda a partir de 900 px. As abas não ficam mais soltas nem desalinhadas.
- **Loja:** categorias ficam em um menu (feito na rodada anterior) e os produtos aparecem com foto.
- **App do entregador:**
  - fonte Roboto, cabeçalho branco limpo e cartões simples;
  - menu inferior com exatamente **Entregas, Rotas, Histórico e Perfil**;
  - o botão "Ficar online" foi removido: abrir o app já deixa o entregador disponível, e sair do app (logout) o deixa offline;
  - a escala só organiza, não bloqueia. O seletor do painel mostra quem está escalado hoje, em entrega ou online; os demais são gerenciados em Entregadores.
- **Biblioteca Unitrix:** não estava acessível nesta sessão na nuvem (pasta de anexos vazia, nenhum repositório com esse nome). O redesign seguiu a identidade azul do Del Flash e os padrões já existentes. Nenhum arquivo da biblioteca foi tocado.

### Dashboard: "Produtos mais vendidos"
- Gráfico de rosca abaixo do card Entregadores, na coluna da direita.
- Mostra % de participação, nome, quantidade, valor, legenda, total e "Outros".
- Filtros: Hoje, Este mês e Personalizado (até 400 dias).
- Conta só pedidos **entregues** da loja, no fuso da loja. Cancelados e pedidos ainda não entregues ficam de fora.
- O gráfico "Origem dos pedidos" foi mantido.

### Minha loja → Endereço
- **Cidade e UF:**
  - cidade numérica ou UF inválida mostram um aviso e o servidor recusa salvar;
  - o campo UF agora é uma lista;
  - novo botão **Buscar CEP** (ViaCEP) preenche rua, bairro, cidade e UF.
- **Localizar pelo endereço:** tenta várias buscas em sequência (rua + número + cidade/UF, depois com bairro, depois sem número) e, por último, o CEP. Mostra mensagens claras quando não encontra.
- **Link da localização no mapa** (opcional):
  - formatos aceitos: Google Maps (`!3d/!4d` e `@lat,lng`), links curtos `maps.app.goo.gl` (o redirecionamento é seguido só para domínios do Google), OpenStreetMap, `geo:`, Apple Maps/Waze por parâmetros, e "lat, lng" digitado;
  - o ponto aparece no mapa, pode ser arrastado, e o botão "Usar no endereço da loja" preenche o endereço em texto;
  - coordenadas nunca são inventadas: um link sem coordenadas é recusado.
- **Usar minha localização atual** continua disponível e não troca o endereço sozinho.

### Faixas de frete por distância
- Adicionar, editar e remover faixas, com ordenação automática.
- Faixas sobrepostas ou repetidas são recusadas, na tela e no servidor.
- A distância máxima atendida é o limite da última faixa.
- Prévia "Testar distância" na própria tela.
- Uma regra única vale na vitrine, no checkout, no pedido e na expedição, e o **servidor** é quem calcula. Com o serviço de rotas ativo (OSRM/ORS), a distância é medida **pelas ruas**; sem ele, em linha reta, e a tela informa qual foi usada.
- O checkout mostra a cotação assim que o cliente confirma o ponto no mapa, ou avisa "fora da área". O servidor recusa pedidos fora da área.
- As configurações antigas (taxa fixa, bairros, raio) foram preservadas.

### WhatsApp
- A caixa de entrada mostra se a conversa está com a IA ou com um atendente.
- Ações disponíveis: assumir, pausar a IA, transferir, encerrar, e **Criar pedido**. Criar pedido abre o pedido manual já com nome, telefone e origem WhatsApp.
- Nenhuma conexão é simulada. Para funcionar em produção falta:
  1. variáveis na Vercel: `WHATSAPP_ASSISTANT_ENABLED=true`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_GRAPH_VERSION`, e também `OPENAI_API_KEY` e `ASSISTANT_AI_MODEL` para a IA;
  2. conectar o número oficial (WhatsApp Cloud API) em Configurações → WhatsApp. Hoje há 0 números conectados;
  3. cadastrar a URL do webhook no app da Meta.

### Pagamento online (Pix e cartão)
- **Provedor:** Asaas, com a conta da **própria loja**, configurada em Configurações → Fiscal e pagamentos. A chave e o token do webhook são gravados cifrados, e o token aparece uma única vez.
- **Checkout:** mostra "Pagar online agora (Pix)" e "(cartão)" só quando a loja ativou o pagamento online. Pede CPF/CNPJ de quem paga.
  - Pix: QR Code e código copia e cola.
  - Cartão: link para a página segura do Asaas. Nenhum dado de cartão passa pelo Del Flash.
- **Acompanhamento do pedido:** mostra a cobrança enquanto o pagamento está pendente.
- **Webhook** `/api/webhooks/pedidos/asaas/<loja>`:
  - exige o token da loja; sem ele, responde 401;
  - relê o pagamento na API e confere pedido, loja e valor;
  - muda PENDENTE → PAGO uma única vez (é idempotente); também trata estorno e falha.
- **Contra duplicidade:** uma cobrança por pedido (reserva antes da chamada ao provedor) e a chave de idempotência do checkout.
- Marcar um pedido online como entregue **não** o marca como pago. Só o provedor confirma o pagamento.
- **Produção bloqueada** até homologação: é preciso definir `ORDER_PAYMENTS_PRODUCTION=true` no servidor. Hoje só o sandbox funciona.
- **TEF não foi implementado**, como pedido.

### Fiscal
- A área de NFC-e/NF-e está preparada, mas **sem emissão real** e sem documentos fictícios. Falta contratar um emissor (provedor fiscal), certificado A1, CSC e regime tributário.

### Pedidos e entregadores
- Já entregues em rodadas anteriores e revalidados agora:
  - pedidos em tempo real, aceite automático, um cartão por pedido e finalizados indo para o histórico;
  - atribuição com seletor "nome — status";
  - rota com várias paradas que o entregador pode reordenar;
  - a localização do entregador não é mostrada à loja.

## Testes antes de publicar
- TypeScript sem erros. Testes unitários: 267 de 267. O build de produção passou.
- Testes e2e reais (navegador + banco local + serviços externos simulados):
  - **ops2, finalflow, driveraccess, session, drivernav, pinflow, customer, temp-nav, bcw, addrbook, cartlink, kbd, landscape:** fluxos que já existiam;
  - **payonline (10):** checkout com Pix e cartão, webhook com token errado ou ausente, evento chegando antes do pagamento, confirmação idempotente, valor divergente e uma cobrança por pedido;
  - **mission (13):**
    - endereço da loja: cidade inválida, Buscar CEP, localizar pelo endereço e link do Google;
    - frete: faixas sobrepostas, prévia, cotação a 0,3 km, 3,9 km e 6,7 km (fora da área);
    - dashboard: produtos mais vendidos e celular a 390 px;
    - pedido criado a partir do WhatsApp;
    - app do entregador com 4 abas, sem botão online, fonte Roboto.

## Pendências externas (dependem do dono ou da plataforma)
1. **Loja `loja-0102` em produção:** a cidade está "5362" e a UF "16". O dono precisa usar Buscar CEP ou corrigir à mão e salvar. Nenhum dado de produção foi alterado.
2. **WhatsApp:** variáveis de ambiente e número oficial (ver acima).
3. **Rotas pelas ruas em produção:** `ROUTING_PROVIDER` + `ORS_API_KEY` (ou um OSRM próprio). Sem isso, a distância é em linha reta.
4. **Pagamento online:** a loja cadastra a chave sandbox; para produção, homologar e definir `ORDER_PAYMENTS_PRODUCTION=true`.
5. **Fiscal:** emissor, certificado e configuração tributária.
6. **E-mail transacional e IA:** `RESEND_API_KEY` e `OPENAI_API_KEY`.

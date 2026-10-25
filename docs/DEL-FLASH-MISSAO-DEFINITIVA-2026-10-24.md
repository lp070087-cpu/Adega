# Del Flash — missão definitiva (24/10/2026)

## Biblioteca Unitrix
A pasta não chegou a esta sessão em nuvem: as pastas de anexos estão vazias e não
há repositório "biblioteca" na conta do GitHub. Nada da biblioteca foi lido nem
alterado. O visual seguiu o sistema próprio do Del Flash (azul `#087EA4`, navy
`#0B1F3A`).

## WhatsApp — causa real e correções
Diagnóstico (código + produção, consulta somente leitura):
1. **Produção sem as variáveis do WhatsApp** na Vercel: `WHATSAPP_ASSISTANT_ENABLED`,
   `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` e `WHATSAPP_GRAPH_VERSION`.
   Sem elas o webhook responde 503 e a Meta não consegue verificar a URL.
2. **Nenhum número conectado**: a tabela `AssistantChannel` existe, mas tem 0 registros.
3. **Respostas automáticas nunca rodavam**: dependiam de `/api/jobs/assistant`, que
   nenhum agendamento chamava. **Corrigido**: o webhook processa a fila da loja logo
   após receber a mensagem.

Também:
- A tela de configuração mostra o estado real (Não conectado, Aguardando mensagens
  ou Conectado), as etapas que faltam e a URL do webhook.
- Nada é simulado: sem conexão, o Atendimento não mostra conversas.
- IA, quando conectada:
  - responde horário e entrega com os dados cadastrados da loja;
  - mostra preço e disponibilidade reais do catálogo;
  - monta o pedido como **link de sacola** (`?sacola=`). O pedido só existe depois
    que o cliente confirma endereço e pagamento no checkout;
  - passa a conversa para a equipe quando o cliente pede atendimento humano.
- A IA não cria pedido, não inventa preço e respeita a janela de 24 h.

Para funcionar de verdade (equipe da plataforma):
1. Aplicativo Meta com WhatsApp Cloud API.
2. Variáveis acima na Vercel.
3. Webhook `https://adega-nine.vercel.app/api/whatsapp/webhook`, campo `messages`.
4. Conectar o número da loja em Admin Central → Serviços (ID do número e token permanente).
5. Opcional, para a IA: `OPENAI_API_KEY` e `ASSISTANT_AI_MODEL`.

## Endereço no mapa (pino central)
- "Marcar local no mapa" abre o mapa em tela cheia com pino fixo no centro: o cliente
  arrasta o mapa até a entrada exata.
- O painel inferior mostra o endereço aproximado (geocodificação reversa) e o botão
  **Confirmar local**.
- Busca por endereço ou **CEP** (ViaCEP, gratuito). A localização do celular é
  opcional; se for negada, a busca e o arraste continuam funcionando.
- Só o ponto confirmado é gravado. Busca e GPS apenas posicionam o mapa.
- O endereço aproximado preenche apenas campos vazios do formulário.
- Endereços da conta guardam ponto e referência. No checkout: endereço principal,
  outro salvo ou novo, com "Salvar este endereço" e "Usar como principal". O CEP passou
  a ser opcional.
- **Armazenamento provisório**: o ponto fica em `PlatformSetting`
  (`portal-address-geo:<id>`) até a migração das colunas ser autorizada (ver pendências).

## Mapas
- Mapa de rotas e navegação do entregador só aparecem já enquadrados nos pontos
  (sem mostrar o Brasil inteiro primeiro).
- Sem ponto de partida, o trajeto liga as paradas a partir da 1ª. Com uma só parada e
  sem GPS, o app orienta a ligar a localização.
- Rotas pelas ruas: OSRM ou OpenRouteService (`ORS_API_KEY`, gratuita). Nunca linha reta.

## Entregadores
- Menu inferior com 5 seções, para uso com uma mão: Início, Entregas, Mapa e rotas,
  Histórico, Ajustes.
- Seletor do pedido segue a regra configurável em Entregadores → Escala:
  - "Programados para hoje" (padrão): mostra quem tem turno hoje e quem já está em entrega;
  - "Todos";
  - se ninguém tem escala ativa, mostra todos.
- A escala nunca bloqueia o entregador.

## Pagamentos
- A situação do pagamento é exibida conforme a forma escolhida: **A cobrar na entrega**
  (dinheiro/cartão), **Aguardando confirmação** (Pix/online), Pago, Recusado, Estornado.
- Escolher a forma de pagamento não marca o pedido como pago. Ao concluir a entrega o
  pedido é registrado como pago e lançado no caixa (regra existente, agora explicada na tela).
- Pagamento online e **TEF**: não ativados. Arquitetura sugerida para quando houver
  provedor:
  - adaptador por provedor no servidor;
  - status vindo somente de webhook assinado;
  - conciliação no caixa.
  Nenhuma transação é aprovada sem resposta real do provedor.

## Documentos fiscais
Em Configurações → Pagamentos e documentos fiscais:
- **cadastro fiscal**: razão social, CNPJ, inscrição estadual, regime tributário, tipo
  de documento (NFC-e ou NF-e) e observações;
- **checklist do que falta**: provedor homologado, certificado A1 e CSC, homologação SEFAZ;
- **estado fixo "Emissão desativada"**: nenhum documento é emitido ou simulado.

## Pendências externas reais
1. Variáveis do WhatsApp e conexão do número (lista acima).
2. `ORS_API_KEY` para rota pelas ruas em produção.
3. Migração para colunas `latitude`, `longitude` e `reference` em
   `CustomerPortalAddress` (precisa de autorização para rodar no Neon de produção).
   Até lá o ponto fica no armazenamento provisório descrito acima.
4. Provedor fiscal, certificado digital e homologação; provedor de pagamento/TEF.
5. A biblioteca Unitrix precisa estar acessível na sessão (ex.: repositório) para ser
   usada como referência.

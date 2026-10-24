# Del Flash — reformulação visual, ponto exato de entrega e mapas (24/10/2026)

## Referência visual
A pasta "biblioteca unitrix" fica na área de trabalho do computador do usuário.
Esta sessão roda na nuvem e **não tem acesso** a ela (não havia sessão local
conectada). Nada foi lido nem alterado lá. Conforme a missão, a identidade azul
do Del Flash foi mantida e o refinamento seguiu um sistema próprio: azul
`#087EA4`, navy `#0B1F3A`, cartões com raio 16–20 px e sombra suave, botões de
44 px no mínimo.

## Checkout e cadastro
| Campo | Regra |
|---|---|
| Nome | obrigatório; **sobrenome não é exigido** (cadastro e checkout) |
| Telefone / WhatsApp | obrigatório |
| Rua / avenida | obrigatório na entrega |
| Número | obrigatório, ou marcar **Sem número** (grava `S/N`) |
| Bairro e cidade | obrigatórios na entrega (cidade vem preenchida com a da loja) |
| Ponto no mapa **ou** observação | um dos dois é obrigatório na entrega |
| Complemento / observação | opcionais quando o ponto foi confirmado |
| Retirada | só nome e telefone |

A validação existe no navegador e no servidor (`checkoutSchema`). Em erro o
carrinho continua intacto.

## Ponto exato da entrega
- "Localizar no mapa" busca o endereço digitado (servidor → geocodificador).
- "Usar minha localização" é opcional; sem permissão, a busca e o toque no
  mapa continuam funcionando.
- O cliente arrasta ou toca o pino e precisa tocar **Confirmar ponto de
  entrega**. Só o ponto confirmado é enviado; a coordenada aproximada da busca
  nunca vai sozinha para o pedido.
- A observação vira a linha `Ponto de entrega: …` nas notas do pedido.
- Painel: "Ver ponto no mapa" abre a coordenada exata.
- Entregador: selo "Ponto exato marcado pelo cliente no mapa", endereço em texto
  separado, observação em destaque; Google Maps/Waze e a rota usam a coordenada.
- Busca pública limitada a 8 por minuto por IP (respeita a política do Nominatim).

## Mapas — avaliação e escolha
| Necessidade | Escolha atual | Custo | Alternativa preparada |
|---|---|---|---|
| Mapa / tiles | OpenStreetMap + Leaflet | grátis | — |
| Geocodificação | Nominatim (padrão) | grátis, uso moderado | `GEOCODING_PROVIDER=google` + `GEOCODING_API_KEY` |
| Rota pelas ruas, distância e tempo | OSRM ou OpenRouteService | ORS grátis com chave | `ROUTING_PROVIDER=ors` + `ORS_API_KEY` ou `ROUTING_PROVIDER=osrm` + `OSRM_URL` |
| Autocomplete | não ativado | Google Places é pago | exige chave paga; não contratado |

Sem serviço de rota configurado, o app **não** mostra distância em linha reta
como se fosse distância de rua: mostra a sequência e oferece Google Maps/Waze.

## Pendências que dependem do responsável
1. `ORS_API_KEY` (gratuita, openrouteservice.org) na Vercel para rota real.
2. Chave Google (Geocoding/Places) só se quiser maior precisão — serviço pago.
3. Guardar o pino no **catálogo de endereços** do cliente exige colunas novas em
   `CustomerPortalAddress` (migração). Não aplicada: requer autorização para
   migração no Neon de produção. Hoje o pino é salvo no pedido.

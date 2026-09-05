# Contrato de adapters de entrega (DeliveryProvider)

Todo canal externo implementa a mesma interface. No front demo atual não há
chamadas reais — este arquivo é o **contrato** que o backend (Next.js + Prisma)
vai implementar.

```ts
// src/integrations/delivery-provider.ts
interface DeliveryProvider {
  readonly id: 'ifood' | '99food' | 'zedelivery' | 'own' | 'whatsapp';
  readonly name: string;

  // Conexão / credenciais (somente backend)
  connect(config: ProviderConfig): Promise<ConnectionStatus>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Pedidos
  getOrders(params: { since?: string; page?: number }): Promise<ProviderOrder[]>;
  acceptOrder(orderExternalId: string): Promise<void>;
  rejectOrder(orderExternalId: string, reason?: string): Promise<void>;
  updateOrderStatus(orderExternalId: string, status: ExternalStatus): Promise<void>;
  getDeliveryInfo(orderExternalId: string): Promise<ExternalDeliveryInfo>;

  // Catálogo (envio da loja → marketplace)
  getCatalog(): Promise<CatalogSnapshot>;
  updateProduct(product: CatalogProduct): Promise<void>;
  updateAvailability(productId: string, available: boolean): Promise<void>;
}

type ConnectionStatus =
  | { ok: true; connectedAt: string; environment: 'sandbox' | 'production' }
  | { ok: false; code: string; message: string; needsAction: 'credentials' | 'approval' | 'maintenance' };
```

## Mappers

Cada marketplace expõe um formato diferente. O mapper converte para o modelo
`Order` normalizado (`normalized-order.md`). Pontos de atenção por canal:

| Canal | Formato nativo | Mapper |
|-------|----------------|--------|
| iFood | `order.created` (evento) + poll de pedidos | `mapIfoodOrderToInternal` |
| 99Food | Webhook de pedido | `map99FoodOrderToInternal` |
| Zé Delivery | Seller Public API `GET /orders` | `mapZeOrderToInternal` |
| Loja própria | JSON do nosso site | já nasce normalizado |

## Simulação honesta (frontend demo)

A demonstração **não fabrica endpoints**: os pedidos "mock" exibidos na Central
vêm de um gerador local marcado como `source: 'ifood' | '99food' | 'zedelivery'`
e com identificador `externalId: 'mock-...'`, sempre rotulados de demonstração.
Nenhuma chamada HTTP é feita a domínios reais.

Quando não houver credencial, o painel mostra **AGUARDANDO CREDENCIAIS / HOMOLOGAÇÃO**
e o botão "Testar conexão" responde sem simular sucesso.

# Modelo normalizado de Pedido (Order)

Interface única consumida pela Central de Pedidos, independente da origem
(`site`, `ifood`, `99food`, `zedelivery`, `balcao`, `whatsapp`).

```ts
// Backend alvo: Next.js + Prisma (PostgreSQL/Neon)
// Valores snake_case no banco; camelCase neste contrato TS.

type OrderStatus =
  | 'new'                  // novo, aguardando confirmação
  | 'confirmed'            // confirmado pela loja
  | 'preparing'            // em preparo
  | 'ready'                // pronto
  | 'waiting_driver'       // aguardando entregador
  | 'out_for_delivery'     // saiu para entrega
  | 'delivered'            // entregue
  | 'cancelled';           // cancelado

type OrderSource = 'site' | 'ifood' | '99food' | 'zedelivery' | 'balcao' | 'whatsapp';

type PaymentMethod =
  | 'Pix' | 'Dinheiro' | 'Cartão de Crédito' | 'Cartão de Débito'
  | 'Online (app)' | 'Online (marketplace)';

interface OrderItemOption {
  name: string;
  price: number;        // acréscimo (R$)
}

interface OrderItem {
  id?: string;
  productId?: string;   // nulo quando o marketplace não expõe o id interno
  externalId?: string;  // id do item no marketplace
  name: string;
  qty: number;
  unitPrice: number;
  options: OrderItemOption[];  // adicionais / variações escolhidas
  total: number;        // (unitPrice * qty) + somatório options
  notes?: string;
}

interface OrderTotals {
  subtotal: number;
  deliveryFee: number;
  discount: number;     // 0 quando o marketplace aplica fora
  total: number;        // subtotal - discount + deliveryFee
}

interface CustomerInfo {
  name: string;
  phone: string;        // com DDD
  document?: string;    // marketplace pode exigir (CPF)
}

interface DeliveryAddress {
  street: string;
  number: string;
  complement?: string;
  district: string;     // bairro
  city: string;
  state: string;
  zip?: string;
  lat?: number;         // preenchido via geocoding
  lng?: number;
  notes?: string;       // ponto de referência
}

interface Order {
  id: string;                  // id interno (uuid)
  organizationId: string;      // tenant
  source: OrderSource;
  externalId?: string;         // id do pedido no marketplace (p/ idempotência)
  displayCode: number;         // número sequencial amigável exibido (#1042)
  status: OrderStatus;
  customer: CustomerInfo;
  delivery: {
    type: 'delivery' | 'pickup';
    address?: DeliveryAddress;
  };
  items: OrderItem[];
  totals: OrderTotals;
  payment: { method: PaymentMethod; paid: boolean; paidAt?: string };
  timestamps: {
    receivedAt: string;
    acceptedAt?: string;
    preparationAt?: string;
    readyAt?: string;
    waitingDriverAt?: string;
    dispatchedAt?: string;
    deliveredAt?: string;
    cancelledAt?: string;
  };
  assignedDriverId?: string;
  proof?: {
    recipientName: string;
    signature?: string;   // dataURL em demo; no backend real vira arquivo
    photo?: string;       // id do arquivo no storage seguro
    receivedAt: string;
  };
  notes?: string;         // observações da loja
  integrationEvents?: string[]; // ids de IntegrationEvent (rastreio)
}
```

## Regras
1. **`externalId` + `organizationId` = chave de idempotência.** Evento duplicado
   do marketplace não gera pedido duplicado (tabela `IntegrationEvent`).
2. `displayCode` é sequencial **por tenant** e **por dia** (ou global sequencial
   com prefixo de origem), nunca reaproveitado.
3. **Pagamento `paid=false`** dispara o fluxo "receber na entrega".
4. Nenhum campo do marketplace é gravado cru: tudo passa pelo mapper para o
   formato acima.

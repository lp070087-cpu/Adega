# Modelagem do banco — Delivery Platform (Prisma + PostgreSQL/Neon)

Rascunho do schema para a stack futura (Next.js + Prisma + Neon + Auth.js).
**Não é o schema aplicado** — serve de guia e será validado no backend.

## Multi-tenant
Todas as entidades operacionais carregam `organizationId`. Isolamento:
- **row-level**: consultas sempre filtram por `organizationId` (helper de acesso).
- Credenciais de integração **criptografadas** (AES-256-GCM) no servidor, nunca no cliente.

## Modelos principais

```prisma
enum OrganizationStatus { TRIAL ACTIVE SUSPENDED }

model Organization {
  id        String   @id @default(cuid())
  slug      String   @unique
  name      String
  category  String?
  plan      String   @default("starter")   // starter | professional | premium
  status    OrganizationStatus @default(TRIAL)
  settings  Json?                          // config da empresa (frete, horário, cor)
  // endereço + geocoding
  address   String?
  lat       Float?
  lng       Float?
  createdAt DateTime @default(now())

  users          User[]
  products       Product[]
  orders         Order[]
  drivers        Driver[]
  integrations   ProviderConnection[]
  integrationLog IntegrationLog[]
}

enum Role { SUPER_ADMIN ADMIN ESTABELECIMENTO GERENTE ATENDENTE COZINHA EXPEDICAO ENTREGADOR }

model User {
  id             String   @id @default(cuid())
  organizationId String?
  email          String   @unique
  passwordHash   String?          // null até definir senha (primeiro acesso)
  name           String
  role           Role
  phone          String?
  active         Boolean  @default(true)
  firstAccess    Boolean  @default(true)
  createdAt      DateTime @default(now())
}

// ── Produto / catálogo (loja própria e sincronização) ──
model Product {
  id             String  @id @default(cuid())
  organizationId String
  name           String
  description    String?
  category       String?
  imageUrls      String[]         // URLs (storage próprio)
  price          Decimal
  promoPrice     Decimal?
  active         Boolean @default(true)
  stock          Int?             // null = sem controle de estoque
  stockMin       Int?
  // variações/adicionais
  variations     Json?            // [{name, price}]
  options        Json?            // [{name, price}]

  @@index([organizationId])
}

// ── Pedido normalizado (ver integrations/normalized-order.md) ──
model Order {
  id             String   @id @default(cuid())
  organizationId String
  source         String            // site ifood 99food zedelivery balcao whatsapp
  externalId     String?           // id no marketplace
  displayCode    Int               // #1042
  status         String            // new ... cancelled
  customer       Json              // {name, phone, ...}
  delivery       Json              // {type, address{...}}
  items          Json              // [{name, qty, unitPrice, options, total}]
  totals         Json              // {subtotal, deliveryFee, discount, total}
  payment        Json              // {method, paid, paidAt?}
  assignedDriverId String?
  proof          Json?
  notes          String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([organizationId, externalId])  // idempotência
  @@index([organizationId, status])
  @@index([organizationId, createdAt])
}

model Driver {
  id             String  @id @default(cuid())
  organizationId String
  name           String
  phone          String?
  vehicle        String?        // moto | carro | bicicleta
  plate          String?
  status         String @default("offline") // offline online busy returning
  // geolocalização
  lat            Float?
  lng            Float?
  lastPingAt     DateTime?
  deliveryCount  Int     @default(0)
  totalReceived  Decimal @default(0)

  @@index([organizationId])
}

// ── Integrações (credenciais criptografadas) ──
model ProviderConnection {
  id             String   @id @default(cuid())
  organizationId String
  provider       String           // ifood | 99food | zedelivery | own
  environment    String   @default("sandbox") // sandbox | production
  status         String   @default("pending")  // pending | active | error | disconnected
  encryptedConfig String?         // AES-256-GCM do payload de credencial
  connectedAt    DateTime?
  lastSyncAt     DateTime?
  @@unique([organizationId, provider])
}

model IntegrationEvent {
  id              String   @id @default(cuid())
  organizationId  String
  provider        String
  externalEventId String
  externalOrderId String?
  type            String
  status          String   @default("received")
  attempts        Int      @default(0)
  createdAt       DateTime @default(now())
  @@unique([organizationId, provider, externalEventId])
}

model IntegrationLog {
  id             String   @id @default(cuid())
  organizationId String
  provider       String?
  level          String   @default("info")
  message        String
  meta           Json?
  createdAt      DateTime @default(now())
}
```

## Observações
- `items`, `customer`, `delivery`, `totals`, `payment` como `Json` mantêm o
  pedido imutável (fotografia) e agilizam a primeira versão; evoluem para
  tabelas relacionais (`OrderItem`, `OrderItemOption`) quando houver relatórios
  analíticos pesados.
- Toda leitura multi-tenant usa o `organizationId` da sessão — nunca um filtro global.
- Decimal para dinheiro (`Decimal` do Prisma mapeia `numeric`).
- `User.role` cobre os 7 perfis; entregador loga via app (senha de dispositivo
  ou token mágico), não pelo painel web completo.

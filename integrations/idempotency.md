# Idempotência de eventos de integração

Marketplaces reentregam webhooks e eventos podem chegar fora de ordem.
A camada de integração garante **zero pedido duplicado** e **zero perda**.

## Tabela `IntegrationEvent` (Prisma)

```prisma
model IntegrationEvent {
  id             String   @id @default(cuid())
  organizationId String   // tenant
  provider       String   // 'ifood' | '99food' | 'zedelivery' | 'own'
  externalEventId String  // id do evento/entrega no provedor
  externalOrderId String  // id do pedido no provedor
  type           String   // 'order.created' | 'order.accepted' | ...
  payload        Json?    // corpo original (opcional, truncado)
  status         String   @default("received") // received | processed | failed
  attempts       Int      @default(0)
  createdAt      DateTime @default(now())
  processedAt    DateTime?

  @@unique([organizationId, provider, externalEventId])
}
```

## Fluxo
1. Webhook chega → verifica `@@unique(organizationId, provider, externalEventId)`.
2. **Já existe?** → responde `200` e ignora (idempotente).
3. **Novo?** → grava `received` → aplica mapper → cria `Order` (ou atualiza status).
   - Se o mapper falhar → `status=failed`, `attempts+1`, agendamento de retry.
4. Marca `processed`.

## Ordem fora de sequência
Eventos atrasados (ex.: `order.accepted` depois de `order.cancelled`) são
rejeitados se conflitarem com o estado atual, gerando log de auditoria.

## Retry e fila
No backend real: fila (BullMQ/Redis) com backoff exponencial, dead-letter para
falhas persistentes e alerta no painel de integrações.

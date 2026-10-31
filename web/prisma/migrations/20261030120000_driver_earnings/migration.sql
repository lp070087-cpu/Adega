-- Ganhos por entrega do entregador. Migração somente aditiva: cria uma tabela
-- nova, sem tocar em pedidos, entregas ou taxas existentes. Sem preenchimento
-- retroativo: entregas antigas não tinham regra de remuneração.
CREATE TABLE IF NOT EXISTS "DriverEarning" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "deliveryFeeCents" INTEGER NOT NULL,
  "ruleSnapshot" JSONB NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DriverEarning_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DriverEarning_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DriverEarning_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DriverEarning_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "DriverEarning_orderId_key" ON "DriverEarning"("orderId");
CREATE INDEX IF NOT EXISTS "DriverEarning_organizationId_completedAt_idx" ON "DriverEarning"("organizationId", "completedAt");
CREATE INDEX IF NOT EXISTS "DriverEarning_organizationId_driverId_completedAt_idx" ON "DriverEarning"("organizationId", "driverId", "completedAt");

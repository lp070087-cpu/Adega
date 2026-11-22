ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3);
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "pickupCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Delivery_organizationId_pickupCode_key" ON "Delivery"("organizationId", "pickupCode");

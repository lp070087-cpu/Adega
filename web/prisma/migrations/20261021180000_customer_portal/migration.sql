-- Pending approval: additive consumer authentication. No production execution.
BEGIN;
-- CreateTable
CREATE TABLE "CustomerPortalAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "noticesReadAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPortalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPortalSession" (
    "tokenHash" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPortalSession_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "CustomerPortalToken" (
    "tokenHash" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "passwordHash" TEXT,
    "email" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPortalToken_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "CustomerPortalAddress" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "label" TEXT,
    "street" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "complement" TEXT,
    "district" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPortalAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPortalOrder" (
    "orderId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPortalOrder_pkey" PRIMARY KEY ("orderId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPortalAccount_organizationId_email_key" ON "CustomerPortalAccount"("organizationId", "email");

-- CreateIndex
CREATE INDEX "CustomerPortalSession_accountId_expiresAt_idx" ON "CustomerPortalSession"("accountId", "expiresAt");

-- CreateIndex
CREATE INDEX "CustomerPortalToken_accountId_purpose_createdAt_idx" ON "CustomerPortalToken"("accountId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerPortalAddress_accountId_idx" ON "CustomerPortalAddress"("accountId");

-- CreateIndex
CREATE INDEX "CustomerPortalOrder_accountId_createdAt_idx" ON "CustomerPortalOrder"("accountId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerPortalAccount" ADD CONSTRAINT "CustomerPortalAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalSession" ADD CONSTRAINT "CustomerPortalSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerPortalAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalToken" ADD CONSTRAINT "CustomerPortalToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerPortalAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalAddress" ADD CONSTRAINT "CustomerPortalAddress_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerPortalAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalOrder" ADD CONSTRAINT "CustomerPortalOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalOrder" ADD CONSTRAINT "CustomerPortalOrder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerPortalAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;

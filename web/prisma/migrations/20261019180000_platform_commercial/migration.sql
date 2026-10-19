BEGIN;
-- CreateTable
CREATE TABLE "PlatformOperator" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SUPPORT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformOperator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformContract" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "period" TEXT NOT NULL DEFAULT 'MONTHLY',
    "amount" DECIMAL(10,2) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "enforceAccess" BOOLEAN NOT NULL DEFAULT false,
    "graceDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaaSCharge" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "competence" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "paidAt" TIMESTAMP(3),
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaaSCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAudit" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "organizationId" TEXT,
    "reason" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PlatformSupportCase" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSupportCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformOperator_userId_key" ON "PlatformOperator"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformContract_id_organizationId_key" ON "PlatformContract"("id", "organizationId");

CREATE UNIQUE INDEX "PlatformContract_organizationId_key" ON "PlatformContract"("organizationId");

-- CreateIndex
CREATE INDEX "PlatformContract_status_dueAt_idx" ON "PlatformContract"("status", "dueAt");

-- CreateIndex
CREATE INDEX "SaaSCharge_organizationId_status_dueAt_idx" ON "SaaSCharge"("organizationId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "SaaSCharge_contractId_competence_key" ON "SaaSCharge"("contractId", "competence");

-- CreateIndex
CREATE INDEX "PlatformAudit_createdAt_idx" ON "PlatformAudit"("createdAt");

-- CreateIndex
CREATE INDEX "PlatformAudit_organizationId_createdAt_idx" ON "PlatformAudit"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformSupportCase_organizationId_status_idx" ON "PlatformSupportCase"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "PlatformOperator" ADD CONSTRAINT "PlatformOperator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformContract" ADD CONSTRAINT "PlatformContract_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformContract" ADD CONSTRAINT "PlatformContract_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaaSCharge" ADD CONSTRAINT "SaaSCharge_contractId_organizationId_fkey" FOREIGN KEY ("contractId", "organizationId") REFERENCES "PlatformContract"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaaSCharge" ADD CONSTRAINT "SaaSCharge_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAudit" ADD CONSTRAINT "PlatformAudit_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "PlatformOperator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSupportCase" ADD CONSTRAINT "PlatformSupportCase_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defensive constraints for manual/administrative writes. No existing data changed.
ALTER TABLE "PlatformOperator" ADD CONSTRAINT "PlatformOperator_role_check" CHECK ("role" IN ('OWNER','ADMIN','SUPPORT','FINANCE'));
ALTER TABLE "PlatformContract" ADD CONSTRAINT "PlatformContract_status_check" CHECK ("status" IN ('TRIAL','ACTIVE','PENDING','PAST_DUE','SUSPENDED','CANCELLED'));
ALTER TABLE "PlatformContract" ADD CONSTRAINT "PlatformContract_period_check" CHECK ("period" IN ('MONTHLY','ANNUAL'));
ALTER TABLE "PlatformContract" ADD CONSTRAINT "PlatformContract_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "PlatformContract" ADD CONSTRAINT "PlatformContract_dates_check" CHECK ("dueAt" >= "startedAt" AND ("trialEndsAt" IS NULL OR "trialEndsAt" >= "startedAt"));
ALTER TABLE "PlatformContract" ADD CONSTRAINT "PlatformContract_graceDays_check" CHECK ("graceDays" BETWEEN 0 AND 90);
ALTER TABLE "SaaSCharge" ADD CONSTRAINT "SaaSCharge_status_check" CHECK ("status" IN ('PENDING','PAID','CANCELLED'));
ALTER TABLE "SaaSCharge" ADD CONSTRAINT "SaaSCharge_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "SaaSCharge" ADD CONSTRAINT "SaaSCharge_paid_check" CHECK (("status" = 'PAID' AND "paidAt" IS NOT NULL AND "paymentMethod" IS NOT NULL) OR ("status" <> 'PAID' AND "paidAt" IS NULL));
ALTER TABLE "PlatformSupportCase" ADD CONSTRAINT "PlatformSupportCase_status_check" CHECK ("status" IN ('OPEN','IN_PROGRESS','RESOLVED'));

COMMIT;

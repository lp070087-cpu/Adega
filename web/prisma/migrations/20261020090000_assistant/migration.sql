BEGIN;
CREATE TABLE "AssistantChannel" (
 "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL UNIQUE REFERENCES "Organization"("id") ON DELETE RESTRICT,
 "phoneNumberId" TEXT NOT NULL UNIQUE, "encryptedToken" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT false,
 "dailyLimit" INTEGER NOT NULL DEFAULT 100 CHECK ("dailyLimit" BETWEEN 1 AND 10000),
 "verifiedAt" TIMESTAMP(3), "webhookVerifiedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "AssistantThread" (
 "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,
 "contact" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'BOT' CHECK ("status" IN ('BOT','HUMAN','CLOSED')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 UNIQUE("organizationId","contact"), UNIQUE("id","organizationId")
);
CREATE INDEX "AssistantThread_organizationId_updatedAt_idx" ON "AssistantThread"("organizationId","updatedAt");
CREATE TABLE "AssistantMessage" (
 "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "threadId" TEXT NOT NULL,
 "externalId" TEXT NOT NULL UNIQUE, "providerMessageId" TEXT UNIQUE,
 "direction" TEXT NOT NULL CHECK ("direction" IN ('IN','OUT')),
 "body" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'RECEIVED', "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 FOREIGN KEY("threadId","organizationId") REFERENCES "AssistantThread"("id","organizationId") ON DELETE RESTRICT
);
CREATE INDEX "AssistantMessage_organizationId_threadId_createdAt_idx" ON "AssistantMessage"("organizationId","threadId","createdAt");
COMMIT;

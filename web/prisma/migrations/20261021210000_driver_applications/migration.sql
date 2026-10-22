BEGIN;
CREATE TABLE "DriverRegistrationLink" (
 "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL UNIQUE,
 "number" SERIAL NOT NULL UNIQUE, "slug" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CHECK ("number" > 0)
);
CREATE TABLE "DriverApplication" (
 "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CHECK ("status" IN ('PENDING','APPROVED','REJECTED','SUSPENDED','REVOKED'))
);
CREATE UNIQUE INDEX "DriverApplication_organizationId_userId_key" ON "DriverApplication"("organizationId","userId");
CREATE INDEX "DriverApplication_organizationId_status_createdAt_idx" ON "DriverApplication"("organizationId","status","createdAt");
CREATE TABLE "DriverApplicationEvent" (
 "id" TEXT PRIMARY KEY, "applicationId" TEXT NOT NULL, "actorId" TEXT NOT NULL,
 "status" TEXT NOT NULL, "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("applicationId") REFERENCES "DriverApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CHECK ("status" IN ('PENDING','APPROVED','REJECTED','SUSPENDED','REVOKED'))
);
CREATE INDEX "DriverApplicationEvent_applicationId_createdAt_idx" ON "DriverApplicationEvent"("applicationId","createdAt");
-- Keep every existing profile. Replace global uniqueness with uniqueness per store.
CREATE UNIQUE INDEX "Driver_organizationId_userId_key" ON "Driver"("organizationId","userId");
DROP INDEX "Driver_userId_key";
COMMIT;

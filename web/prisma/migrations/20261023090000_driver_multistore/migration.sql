-- One driver account can work for several stores, with one profile per store.
-- Keeps every existing profile and delivery; only the uniqueness rule changes.
BEGIN;
CREATE UNIQUE INDEX "Driver_organizationId_userId_key" ON "Driver"("organizationId", "userId");
DROP INDEX "Driver_userId_key";
COMMIT;

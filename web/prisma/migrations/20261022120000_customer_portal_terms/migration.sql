-- Pending approval: additive column recording when the customer accepted the terms.
-- Apply only after 20261021180000_customer_portal. No production execution without approval.
BEGIN;
ALTER TABLE "CustomerPortalAccount" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
COMMIT;

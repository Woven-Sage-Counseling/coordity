-- Per-org-style QuickBooks app credentials for self-serve Integrations setup.
-- Kept on the existing singleton connection row (id = 'default') used by Financials today.

ALTER TABLE "quickbooks_connection" ADD COLUMN "client_id" TEXT;
ALTER TABLE "quickbooks_connection" ADD COLUMN "client_secret_encrypted" TEXT;
ALTER TABLE "quickbooks_connection" ADD COLUMN "environment" TEXT DEFAULT 'sandbox';

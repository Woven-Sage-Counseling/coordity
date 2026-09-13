-- Display company + connecting user on Integrations (like DocuSign "Connected as …").

ALTER TABLE "quickbooks_connection" ADD COLUMN "company_name" TEXT;
ALTER TABLE "quickbooks_connection" ADD COLUMN "connected_email" TEXT;

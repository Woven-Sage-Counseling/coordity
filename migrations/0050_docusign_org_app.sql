-- Per-org DocuSign app credentials so admins can self-serve connect.

ALTER TABLE "docusign_connection" ADD COLUMN "integration_key" TEXT;
ALTER TABLE "docusign_connection" ADD COLUMN "secret_key_encrypted" TEXT;
ALTER TABLE "docusign_connection" ADD COLUMN "auth_server" TEXT;

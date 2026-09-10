-- Per-organization favicon (admin-uploaded), stored as base64 in D1.

ALTER TABLE "organization" ADD COLUMN "favicon_mime" TEXT;
ALTER TABLE "organization" ADD COLUMN "favicon_data" TEXT;
ALTER TABLE "organization" ADD COLUMN "favicon_updated_at" INTEGER;

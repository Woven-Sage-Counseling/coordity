-- Coordity multi-tenant org fields. Woven Sage is the first seeded tenant.

ALTER TABLE "organization" ADD COLUMN "slug" TEXT;
ALTER TABLE "organization" ADD COLUMN "display_name" TEXT;
ALTER TABLE "organization" ADD COLUMN "logo_url" TEXT;
ALTER TABLE "organization" ADD COLUMN "website_url" TEXT;
ALTER TABLE "organization" ADD COLUMN "updated_at" INTEGER;

UPDATE "organization"
SET
  "slug" = 'wovensage',
  "display_name" = 'Woven Sage Counseling',
  "logo_url" = 'https://wovensage.com/images/logo-text-header-transparent.png',
  "website_url" = 'https://wovensage.com',
  "name" = 'Woven Sage Counseling',
  "updated_at" = "created_at"
WHERE "id" = 'org_wovensage';

CREATE UNIQUE INDEX IF NOT EXISTS "organization_slug_uidx"
  ON "organization" ("slug")
  WHERE "slug" IS NOT NULL;

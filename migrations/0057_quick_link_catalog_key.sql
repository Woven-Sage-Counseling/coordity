-- Track which catalog template a quick link was added from (optional).
-- Built-in auto-shown apps are retired; orgs only see links they add.

ALTER TABLE "portal_quick_link" ADD COLUMN "catalog_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_portal_quick_link_org_catalog"
  ON "portal_quick_link" ("org_id", "catalog_key")
  WHERE "catalog_key" IS NOT NULL;

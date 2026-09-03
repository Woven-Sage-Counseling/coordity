-- Organization-scoped timesheet work item categories (label + color).

CREATE TABLE IF NOT EXISTS "organization" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "timesheet_work_category" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "org_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "active" INTEGER NOT NULL DEFAULT 1,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("org_id") REFERENCES "organization" ("id") ON DELETE CASCADE,
  UNIQUE ("org_id", "key")
);

CREATE INDEX IF NOT EXISTS "timesheet_work_category_org_idx" ON "timesheet_work_category" ("org_id");
CREATE INDEX IF NOT EXISTS "timesheet_work_category_org_active_idx"
  ON "timesheet_work_category" ("org_id", "active", "sort_order");

INSERT OR IGNORE INTO "organization" ("id", "name", "created_at")
VALUES ('org_wovensage', 'Woven Sage', 1756500000000);

INSERT OR IGNORE INTO "timesheet_work_category" ("id", "org_id", "key", "label", "color", "sort_order", "active", "created_at", "updated_at") VALUES
  ('twc_quickbooks', 'org_wovensage', 'quickbooks', 'QuickBooks', '#2CA01C', 0, 1, 1756500000000, 1756500000000),
  ('twc_simple_practice', 'org_wovensage', 'simple_practice', 'SimplePractice', '#1a73e8', 1, 1, 1756500000000, 1756500000000),
  ('twc_website', 'org_wovensage', 'website', 'Website', '#7c3aed', 2, 1, 1756500000000, 1756500000000),
  ('twc_branding', 'org_wovensage', 'branding', 'Branding', '#db2777', 3, 1, 1756500000000, 1756500000000),
  ('twc_social_media', 'org_wovensage', 'social_media', 'Social Media', '#ea580c', 4, 1, 1756500000000, 1756500000000),
  ('twc_marketing', 'org_wovensage', 'marketing', 'Marketing', '#ca8a04', 5, 1, 1756500000000, 1756500000000),
  ('twc_banking', 'org_wovensage', 'banking', 'Banking', '#0891b2', 6, 1, 1756500000000, 1756500000000),
  ('twc_credentialing', 'org_wovensage', 'credentialing', 'Credentialing', '#4f46e5', 7, 1, 1756500000000, 1756500000000),
  ('twc_hr', 'org_wovensage', 'hr', 'HR', '#be185d', 8, 1, 1756500000000, 1756500000000),
  ('twc_incorporation_documents', 'org_wovensage', 'incorporation_documents', 'Incorporation Documents', '#78716c', 9, 1, 1756500000000, 1756500000000),
  ('twc_operating_agreements', 'org_wovensage', 'operating_agreements', 'Operating Agreements', '#57534e', 10, 1, 1756500000000, 1756500000000),
  ('twc_training', 'org_wovensage', 'training', 'Training', '#059669', 11, 1, 1756500000000, 1756500000000),
  ('twc_technology', 'org_wovensage', 'technology', 'Technology', '#475569', 12, 1, 1756500000000, 1756500000000),
  ('twc_client_outreach', 'org_wovensage', 'client_outreach', 'Client Outreach', '#0d9488', 13, 1, 1756500000000, 1756500000000),
  ('twc_client_transfer', 'org_wovensage', 'client_transfer', 'Client Transfer', '#65a30d', 14, 1, 1756500000000, 1756500000000),
  ('twc_billing', 'org_wovensage', 'billing', 'Billing', '#dc2626', 15, 1, 1756500000000, 1756500000000);

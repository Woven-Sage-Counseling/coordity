-- Org-editable Quick link section titles and order.

CREATE TABLE IF NOT EXISTS "portal_quick_link_category" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  PRIMARY KEY ("org_id", "id"),
  FOREIGN KEY ("org_id") REFERENCES "organization" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_portal_quick_link_category_org"
  ON "portal_quick_link_category" ("org_id", "sort_order");

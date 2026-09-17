-- Org-managed Quick links: custom buttons + per-org built-in toggles/roles.

CREATE TABLE IF NOT EXISTS "portal_quick_link" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "org_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "href" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL CHECK (
    "category" IN ('clinical', 'billing', 'business', 'financial', 'internal')
  ),
  "icon_src" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("org_id") REFERENCES "organization" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_portal_quick_link_org"
  ON "portal_quick_link" ("org_id", "sort_order", "name");

CREATE TABLE IF NOT EXISTS "portal_quick_link_role" (
  "link_id" TEXT NOT NULL,
  "role_key" TEXT NOT NULL,
  PRIMARY KEY ("link_id", "role_key"),
  FOREIGN KEY ("link_id") REFERENCES "portal_quick_link" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "portal_builtin_app_setting" (
  "org_id" TEXT NOT NULL,
  "app_id" TEXT NOT NULL,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "roles_configured" INTEGER NOT NULL DEFAULT 0,
  "sort_order" INTEGER,
  "updated_at" INTEGER NOT NULL,
  PRIMARY KEY ("org_id", "app_id"),
  FOREIGN KEY ("org_id") REFERENCES "organization" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "portal_builtin_app_role" (
  "org_id" TEXT NOT NULL,
  "app_id" TEXT NOT NULL,
  "role_key" TEXT NOT NULL,
  PRIMARY KEY ("org_id", "app_id", "role_key"),
  FOREIGN KEY ("org_id", "app_id") REFERENCES "portal_builtin_app_setting" ("org_id", "app_id") ON DELETE CASCADE
);

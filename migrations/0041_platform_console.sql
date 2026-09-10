-- Coordity platform console RBAC + soft-archive orgs.

ALTER TABLE "organization" ADD COLUMN "archived_at" INTEGER;

CREATE TABLE IF NOT EXISTS "platform_role" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "key" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT
);

CREATE TABLE IF NOT EXISTS "platform_permission" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "key" TEXT NOT NULL UNIQUE,
  "description" TEXT
);

CREATE TABLE IF NOT EXISTS "platform_role_permission" (
  "role_id" TEXT NOT NULL,
  "permission_id" TEXT NOT NULL,
  PRIMARY KEY ("role_id", "permission_id"),
  FOREIGN KEY ("role_id") REFERENCES "platform_role" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("permission_id") REFERENCES "platform_permission" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "platform_staff" (
  "user_id" TEXT PRIMARY KEY NOT NULL,
  "role_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("role_id") REFERENCES "platform_role" ("id")
);

INSERT OR IGNORE INTO "platform_role" ("id", "key", "name", "description") VALUES
  ('plat_role_owner', 'platform_owner', 'Platform owner', 'Full Coordity platform control'),
  ('plat_role_sales', 'platform_sales', 'Sales', 'Org visibility and create; marketing tools later'),
  ('plat_role_it', 'platform_it', 'IT', 'Org visibility and technical support tools later'),
  ('plat_role_security', 'platform_security', 'Security', 'Org visibility and audit tools later');

INSERT OR IGNORE INTO "platform_permission" ("id", "key", "description") VALUES
  ('plat_perm_access', 'platform:access', 'Sign in to the Coordity platform console'),
  ('plat_perm_orgs_read', 'platform:orgs:read', 'List and view customer organizations'),
  ('plat_perm_orgs_create', 'platform:orgs:create', 'Create customer organizations'),
  ('plat_perm_orgs_delete', 'platform:orgs:delete', 'Archive customer organizations'),
  ('plat_perm_staff_manage', 'platform:staff:manage', 'Manage Coordity platform staff'),
  ('plat_perm_marketing', 'platform:marketing:manage', 'Manage marketing and promotions');

-- Platform owner: everything
INSERT OR IGNORE INTO "platform_role_permission" ("role_id", "permission_id")
SELECT 'plat_role_owner', "id" FROM "platform_permission";

-- Sales
INSERT OR IGNORE INTO "platform_role_permission" ("role_id", "permission_id") VALUES
  ('plat_role_sales', 'plat_perm_access'),
  ('plat_role_sales', 'plat_perm_orgs_read'),
  ('plat_role_sales', 'plat_perm_orgs_create'),
  ('plat_role_sales', 'plat_perm_marketing');

-- IT
INSERT OR IGNORE INTO "platform_role_permission" ("role_id", "permission_id") VALUES
  ('plat_role_it', 'plat_perm_access'),
  ('plat_role_it', 'plat_perm_orgs_read');

-- Security
INSERT OR IGNORE INTO "platform_role_permission" ("role_id", "permission_id") VALUES
  ('plat_role_security', 'plat_perm_access'),
  ('plat_role_security', 'plat_perm_orgs_read');

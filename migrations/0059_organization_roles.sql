-- Per-organization role catalog (defaults copied from global templates + custom roles).

CREATE TABLE IF NOT EXISTS "organization_role" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "org_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "is_system" INTEGER NOT NULL DEFAULT 0,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  UNIQUE ("org_id", "key"),
  FOREIGN KEY ("org_id") REFERENCES "organization" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_organization_role_org"
  ON "organization_role" ("org_id", "sort_order", "name");

CREATE TABLE IF NOT EXISTS "organization_role_permission" (
  "role_id" TEXT NOT NULL,
  "permission_key" TEXT NOT NULL,
  PRIMARY KEY ("role_id", "permission_key"),
  FOREIGN KEY ("role_id") REFERENCES "organization_role" ("id") ON DELETE CASCADE
);

-- Insurance credentialing: groups, plans, providers, and coverage status.

INSERT OR IGNORE INTO "permission" ("id", "key", "description") VALUES
  ('perm_credentialing_view', 'credentialing:view', 'View provider insurance coverage and credentialing status'),
  ('perm_credentialing_manage', 'credentialing:manage', 'Manage insurance groups, plans, providers, and coverage');

INSERT OR IGNORE INTO "role_permission" ("role_id", "permission_id") VALUES
  ('role_clinician', 'perm_credentialing_view'),
  ('role_finance', 'perm_credentialing_view'),
  ('role_finance', 'perm_credentialing_manage'),
  ('role_manager', 'perm_credentialing_view'),
  ('role_manager', 'perm_credentialing_manage'),
  ('role_owner', 'perm_credentialing_view'),
  ('role_owner', 'perm_credentialing_manage'),
  ('role_owner_view', 'perm_credentialing_view'),
  ('role_owner_view', 'perm_credentialing_manage');

CREATE TABLE IF NOT EXISTS "insurance_group" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "insurance_plan" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "group_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" INTEGER NOT NULL,
  FOREIGN KEY ("group_id") REFERENCES "insurance_group" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "credentialing_provider" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "user_id" TEXT UNIQUE,
  "created_at" INTEGER NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "provider_plan_coverage" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "provider_id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('accepted', 'credentialing')),
  "updated_at" INTEGER NOT NULL,
  "updated_by" TEXT,
  UNIQUE ("provider_id", "plan_id"),
  FOREIGN KEY ("provider_id") REFERENCES "credentialing_provider" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("plan_id") REFERENCES "insurance_plan" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("updated_by") REFERENCES "user" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "insurance_plan_group_idx" ON "insurance_plan" ("group_id");
CREATE INDEX IF NOT EXISTS "provider_plan_coverage_provider_idx" ON "provider_plan_coverage" ("provider_id");
CREATE INDEX IF NOT EXISTS "provider_plan_coverage_status_idx" ON "provider_plan_coverage" ("status");

-- Seed: Michele L. Evans + Aetna plans (accepted).
INSERT OR IGNORE INTO "credentialing_provider" ("id", "name", "user_id", "created_at")
VALUES ('provider_michele_evans', 'Michele L. Evans', NULL, 1756500000000);

INSERT OR IGNORE INTO "insurance_group" ("id", "name", "sort_order", "created_at")
VALUES ('group_aetna', 'Aetna', 0, 1756500000000);

INSERT OR IGNORE INTO "insurance_plan" ("id", "group_id", "name", "sort_order", "created_at") VALUES
  ('plan_aetna_choice_pos_ii', 'group_aetna', 'Aetna Choice POS II', 0, 1756500000000),
  ('plan_aetna_open_access_select', 'group_aetna', 'Open Access Aetna Select', 1, 1756500000000),
  ('plan_aetna_open_access_health_network', 'group_aetna', 'Open Access Aetna Health Network Only', 2, 1756500000000);

INSERT OR IGNORE INTO "provider_plan_coverage" ("id", "provider_id", "plan_id", "status", "updated_at", "updated_by") VALUES
  ('cov_michele_aetna_choice', 'provider_michele_evans', 'plan_aetna_choice_pos_ii', 'accepted', 1756500000000, NULL),
  ('cov_michele_aetna_select', 'provider_michele_evans', 'plan_aetna_open_access_select', 'accepted', 1756500000000, NULL),
  ('cov_michele_aetna_network', 'provider_michele_evans', 'plan_aetna_open_access_health_network', 'accepted', 1756500000000, NULL);

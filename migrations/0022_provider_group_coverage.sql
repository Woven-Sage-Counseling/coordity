-- Network-level provider coverage (independent of insurance plans).

CREATE TABLE IF NOT EXISTS "provider_group_coverage" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "provider_id" TEXT NOT NULL,
  "group_id" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN (
    'application_submitted',
    'credentialing',
    'in_network',
    'denied',
    'terminated',
    'not_participating'
  )),
  "updated_at" INTEGER NOT NULL,
  "updated_by" TEXT,
  UNIQUE ("provider_id", "group_id"),
  FOREIGN KEY ("provider_id") REFERENCES "credentialing_provider" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("group_id") REFERENCES "insurance_group" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("updated_by") REFERENCES "user" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "provider_group_coverage_provider_idx" ON "provider_group_coverage" ("provider_id");
CREATE INDEX IF NOT EXISTS "provider_group_coverage_group_idx" ON "provider_group_coverage" ("group_id");
CREATE INDEX IF NOT EXISTS "provider_group_coverage_status_idx" ON "provider_group_coverage" ("status");

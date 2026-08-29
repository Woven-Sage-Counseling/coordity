-- Expand provider_plan_coverage status values. Map legacy accepted -> in_network.

PRAGMA foreign_keys = OFF;

CREATE TABLE "provider_plan_coverage_new" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "provider_id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
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
  UNIQUE ("provider_id", "plan_id"),
  FOREIGN KEY ("provider_id") REFERENCES "credentialing_provider" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("plan_id") REFERENCES "insurance_plan" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("updated_by") REFERENCES "user" ("id") ON DELETE SET NULL
);

INSERT INTO "provider_plan_coverage_new" ("id", "provider_id", "plan_id", "status", "updated_at", "updated_by")
SELECT
  "id",
  "provider_id",
  "plan_id",
  CASE
    WHEN "status" = 'accepted' THEN 'in_network'
    ELSE "status"
  END,
  "updated_at",
  "updated_by"
FROM "provider_plan_coverage";

DROP TABLE "provider_plan_coverage";

ALTER TABLE "provider_plan_coverage_new" RENAME TO "provider_plan_coverage";

CREATE INDEX IF NOT EXISTS "provider_plan_coverage_provider_idx" ON "provider_plan_coverage" ("provider_id");
CREATE INDEX IF NOT EXISTS "provider_plan_coverage_status_idx" ON "provider_plan_coverage" ("status");

PRAGMA foreign_keys = ON;

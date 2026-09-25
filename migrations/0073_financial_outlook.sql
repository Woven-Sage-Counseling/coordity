-- Per-organization financial outlook. Existing QuickBooks tokens stay on the current connection row.

ALTER TABLE "financial_snapshot" ADD COLUMN "org_id" TEXT;

UPDATE "financial_snapshot" SET "org_id" = 'org_wovensage' WHERE "org_id" IS NULL;

CREATE INDEX IF NOT EXISTS "financial_snapshot_org_period_idx"
  ON "financial_snapshot" ("org_id", "period_start", "period_end", "created_at");

ALTER TABLE "quickbooks_connection" ADD COLUMN "org_id" TEXT;

UPDATE "quickbooks_connection" SET "org_id" = 'org_wovensage' WHERE "org_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "quickbooks_connection_org_idx"
  ON "quickbooks_connection" ("org_id");

CREATE TABLE IF NOT EXISTS "financial_outlook" (
  "org_id" TEXT PRIMARY KEY NOT NULL,
  "reserve_target_months" INTEGER NOT NULL DEFAULT 3,
  "operations_start" TEXT,
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("org_id") REFERENCES "organization" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "financial_outlook_line" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('expense', 'cash')),
  "role" TEXT NOT NULL CHECK ("role" IN ('expense', 'operating', 'reserve')),
  "label" TEXT NOT NULL,
  "color" TEXT,
  "sort_order" INTEGER NOT NULL,
  PRIMARY KEY ("org_id", "id"),
  FOREIGN KEY ("org_id") REFERENCES "organization" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "financial_outlook_line_order_idx"
  ON "financial_outlook_line" ("org_id", "sort_order");

CREATE TABLE IF NOT EXISTS "financial_outlook_account" (
  "org_id" TEXT NOT NULL,
  "line_id" TEXT NOT NULL,
  "match_name" TEXT NOT NULL,
  "qb_account_id" TEXT,
  PRIMARY KEY ("org_id", "line_id", "match_name"),
  FOREIGN KEY ("org_id", "line_id") REFERENCES "financial_outlook_line" ("org_id", "id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "financial_cash_balance" (
  "org_id" TEXT NOT NULL,
  "line_id" TEXT NOT NULL,
  "balance_cents" INTEGER,
  "as_of_date" TEXT,
  "updated_at" INTEGER NOT NULL,
  PRIMARY KEY ("org_id", "line_id"),
  FOREIGN KEY ("org_id") REFERENCES "organization" ("id") ON DELETE CASCADE
);

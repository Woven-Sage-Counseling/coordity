CREATE TABLE IF NOT EXISTS "financial_dashboard_card" (
  "org_id" TEXT NOT NULL,
  "card_key" TEXT NOT NULL,
  "enabled" INTEGER NOT NULL DEFAULT 0,
  "view_mode" TEXT,
  "account_ids" TEXT NOT NULL DEFAULT '[]',
  "updated_at" INTEGER NOT NULL,
  PRIMARY KEY ("org_id", "card_key"),
  FOREIGN KEY ("org_id") REFERENCES "organization" ("id") ON DELETE CASCADE
);

-- Better Auth core tables + Woven Sage employee portal schema.
-- No patient, clinical, appointment, insurance, or PHI columns.

CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "email_verified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "expires_at" TEXT NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "user_id" TEXT NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "session" ("user_id");

CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "account_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "id_token" TEXT,
  "access_token_expires_at" TEXT,
  "refresh_token_expires_at" TEXT,
  "scope" TEXT,
  "password" TEXT,
  "issuer" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "account" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "account_issuer_account_id_uid" ON "account" ("issuer", "account_id");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,
  "created_at" TEXT,
  "updated_at" TEXT
);

CREATE TABLE IF NOT EXISTS "employee_profile" (
  "user_id" TEXT PRIMARY KEY NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'active', 'disabled')),
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "role" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "key" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "permission" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "key" TEXT NOT NULL UNIQUE,
  "description" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "role_permission" (
  "role_id" TEXT NOT NULL,
  "permission_id" TEXT NOT NULL,
  PRIMARY KEY ("role_id", "permission_id"),
  FOREIGN KEY ("role_id") REFERENCES "role" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("permission_id") REFERENCES "permission" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "user_role" (
  "user_id" TEXT NOT NULL,
  "role_id" TEXT NOT NULL,
  "assigned_by" TEXT,
  "assigned_at" INTEGER NOT NULL,
  PRIMARY KEY ("user_id", "role_id"),
  FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("role_id") REFERENCES "role" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "invitation" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL UNIQUE,
  "invited_by" TEXT NOT NULL,
  "expires_at" INTEGER NOT NULL,
  "accepted_at" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'accepted', 'revoked', 'expired')),
  "created_at" INTEGER NOT NULL,
  FOREIGN KEY ("role_id") REFERENCES "role" ("id"),
  FOREIGN KEY ("invited_by") REFERENCES "user" ("id")
);

CREATE INDEX IF NOT EXISTS "invitation_email_idx" ON "invitation" ("email");

CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "actor_user_id" TEXT,
  "action" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT,
  "metadata" TEXT,
  "created_at" INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx" ON "audit_log" ("created_at");

CREATE TABLE IF NOT EXISTS "financial_snapshot" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "source" TEXT NOT NULL CHECK ("source" IN ('manual', 'quickbooks')),
  "accounting_method" TEXT NOT NULL DEFAULT 'cash',
  "period_start" TEXT NOT NULL,
  "period_end" TEXT NOT NULL,
  "revenue_cents" INTEGER NOT NULL,
  "therapist_compensation_cents" INTEGER NOT NULL,
  "management_compensation_cents" INTEGER NOT NULL,
  "software_and_technology_cents" INTEGER NOT NULL,
  "total_expenses_cents" INTEGER NOT NULL,
  "net_income_cents" INTEGER NOT NULL,
  "created_at" INTEGER NOT NULL,
  "notes" TEXT
);

CREATE TABLE IF NOT EXISTS "cash_account_balance" (
  "account_key" TEXT PRIMARY KEY NOT NULL,
  "label" TEXT NOT NULL,
  "balance_cents" INTEGER,
  "as_of_date" TEXT,
  "updated_at" INTEGER
);

CREATE TABLE IF NOT EXISTS "reserve_setting" (
  "id" INTEGER PRIMARY KEY CHECK ("id" = 1),
  "target_months" INTEGER NOT NULL DEFAULT 3,
  "notes" TEXT
);

CREATE TABLE IF NOT EXISTS "quickbooks_connection" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "realm_id" TEXT,
  "access_token_encrypted" TEXT,
  "refresh_token_encrypted" TEXT,
  "access_token_expires_at" INTEGER,
  "refresh_token_expires_at" INTEGER,
  "connected_by" TEXT,
  "connected_at" INTEGER,
  "last_sync_at" INTEGER,
  "last_error" TEXT,
  "status" TEXT NOT NULL DEFAULT 'disconnected' CHECK ("status" IN ('disconnected', 'connected', 'error'))
);

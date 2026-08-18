-- Better Auth stores sqlite dates as text. Recreate empty auth tables to match.

PRAGMA foreign_keys = OFF;

CREATE TABLE "user_new" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "email_verified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);
INSERT INTO "user_new" SELECT * FROM "user";
DROP TABLE "user";
ALTER TABLE "user_new" RENAME TO "user";

CREATE TABLE "session_new" (
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
INSERT INTO "session_new" SELECT * FROM "session";
DROP TABLE "session";
ALTER TABLE "session_new" RENAME TO "session";
CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "session" ("user_id");

CREATE TABLE "account_new" (
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
INSERT INTO "account_new" SELECT * FROM "account";
DROP TABLE "account";
ALTER TABLE "account_new" RENAME TO "account";
CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "account" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "account_issuer_account_id_uid" ON "account" ("issuer", "account_id");

CREATE TABLE "verification_new" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,
  "created_at" TEXT,
  "updated_at" TEXT
);
INSERT INTO "verification_new" SELECT * FROM "verification";
DROP TABLE "verification";
ALTER TABLE "verification_new" RENAME TO "verification";

PRAGMA foreign_keys = ON;

-- DocuSign org connection + training envelope tracking.
-- Extends training_block with docusign type and template columns.

CREATE TABLE IF NOT EXISTS "docusign_connection" (
  "org_id" TEXT PRIMARY KEY NOT NULL,
  "account_id" TEXT,
  "base_uri" TEXT,
  "account_email" TEXT,
  "account_name" TEXT,
  "access_token_encrypted" TEXT,
  "refresh_token_encrypted" TEXT,
  "token_expires_at" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'disconnected'
    CHECK ("status" IN ('disconnected', 'connected', 'error')),
  "connected_by" TEXT,
  "connected_at" INTEGER,
  "last_error" TEXT,
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("org_id") REFERENCES "organization" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("connected_by") REFERENCES "user" ("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "training_docusign_envelope" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "org_id" TEXT NOT NULL,
  "block_id" TEXT NOT NULL,
  "lesson_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "envelope_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'created'
    CHECK ("status" IN ('created', 'sent', 'delivered', 'completed', 'declined', 'voided')),
  "completed_at" INTEGER,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  UNIQUE ("block_id", "user_id"),
  FOREIGN KEY ("org_id") REFERENCES "organization" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("block_id") REFERENCES "training_block" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("lesson_id") REFERENCES "training_lesson" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "training_docusign_envelope_org_idx"
  ON "training_docusign_envelope" ("org_id", "status");
CREATE INDEX IF NOT EXISTS "training_docusign_envelope_envelope_idx"
  ON "training_docusign_envelope" ("envelope_id");
CREATE INDEX IF NOT EXISTS "training_docusign_envelope_user_idx"
  ON "training_docusign_envelope" ("user_id", "lesson_id");

PRAGMA foreign_keys = OFF;

CREATE TABLE "training_block_new" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "lesson_id" TEXT NOT NULL,
  "type" TEXT NOT NULL
    CHECK ("type" IN ('video', 'written', 'resource', 'quiz', 'ack', 'docusign')),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "youtube_url" TEXT,
  "body_text" TEXT,
  "resource_url" TEXT,
  "resource_label" TEXT,
  "file_name" TEXT,
  "file_mime" TEXT,
  "file_data" TEXT,
  "ack_prompt" TEXT,
  "pass_percent" INTEGER,
  "docusign_template_id" TEXT,
  "docusign_template_name" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("lesson_id") REFERENCES "training_lesson" ("id") ON DELETE CASCADE
);

INSERT INTO "training_block_new" (
  "id", "lesson_id", "type", "sort_order", "youtube_url", "body_text", "resource_url",
  "resource_label", "file_name", "file_mime", "file_data", "ack_prompt", "pass_percent",
  "docusign_template_id", "docusign_template_name", "created_at", "updated_at"
)
SELECT
  "id", "lesson_id", "type", "sort_order", "youtube_url", "body_text", "resource_url",
  "resource_label", "file_name", "file_mime", "file_data", "ack_prompt", "pass_percent",
  NULL, NULL, "created_at", "updated_at"
FROM "training_block";

DROP TABLE "training_block";
ALTER TABLE "training_block_new" RENAME TO "training_block";

CREATE INDEX IF NOT EXISTS "training_block_lesson_sort_idx"
  ON "training_block" ("lesson_id", "sort_order");

PRAGMA foreign_keys = ON;

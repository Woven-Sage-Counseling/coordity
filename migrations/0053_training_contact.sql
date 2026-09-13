-- Contact-details training blocks + per-user block responses for admin review.

PRAGMA foreign_keys = OFF;

CREATE TABLE "training_block_new" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "lesson_id" TEXT NOT NULL,
  "type" TEXT NOT NULL
    CHECK ("type" IN ('video', 'written', 'resource', 'quiz', 'ack', 'docusign', 'contact')),
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
  "docusign_template_id", "docusign_template_name", "created_at", "updated_at"
FROM "training_block";

DROP TABLE "training_block";
ALTER TABLE "training_block_new" RENAME TO "training_block";

CREATE INDEX IF NOT EXISTS "training_block_lesson_sort_idx"
  ON "training_block" ("lesson_id", "sort_order");

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "training_block_response" (
  "user_id" TEXT NOT NULL,
  "block_id" TEXT NOT NULL,
  "answers_json" TEXT NOT NULL,
  "updated_at" INTEGER NOT NULL,
  PRIMARY KEY ("user_id", "block_id"),
  FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("block_id") REFERENCES "training_block" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "training_block_response_block_idx"
  ON "training_block_response" ("block_id", "updated_at");

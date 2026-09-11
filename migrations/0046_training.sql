-- Org-scoped training / onboarding curriculum.

CREATE TABLE IF NOT EXISTS "training_module" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "org_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'custom'
    CHECK ("kind" IN ('onboarding', 'using_coordity', 'custom')),
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "visible" INTEGER NOT NULL DEFAULT 1,
  "archived_at" INTEGER,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("org_id") REFERENCES "organization" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "training_module_org_sort_idx"
  ON "training_module" ("org_id", "sort_order", "created_at");

CREATE TABLE IF NOT EXISTS "training_module_role" (
  "module_id" TEXT NOT NULL,
  "role_key" TEXT NOT NULL,
  PRIMARY KEY ("module_id", "role_key"),
  FOREIGN KEY ("module_id") REFERENCES "training_module" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "training_lesson" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "module_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "required" INTEGER NOT NULL DEFAULT 1,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("module_id") REFERENCES "training_module" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "training_lesson_module_sort_idx"
  ON "training_lesson" ("module_id", "sort_order");

CREATE TABLE IF NOT EXISTS "training_block" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "lesson_id" TEXT NOT NULL,
  "type" TEXT NOT NULL
    CHECK ("type" IN ('video', 'written', 'resource', 'quiz', 'ack')),
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
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("lesson_id") REFERENCES "training_lesson" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "training_block_lesson_sort_idx"
  ON "training_block" ("lesson_id", "sort_order");

CREATE TABLE IF NOT EXISTS "training_quiz_question" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "block_id" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "options_json" TEXT NOT NULL,
  "correct_index" INTEGER NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY ("block_id") REFERENCES "training_block" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "training_quiz_question_block_idx"
  ON "training_quiz_question" ("block_id", "sort_order");

CREATE TABLE IF NOT EXISTS "training_lesson_progress" (
  "user_id" TEXT NOT NULL,
  "lesson_id" TEXT NOT NULL,
  "completed_at" INTEGER NOT NULL,
  "ack_name" TEXT,
  PRIMARY KEY ("user_id", "lesson_id"),
  FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("lesson_id") REFERENCES "training_lesson" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "training_lesson_progress_user_idx"
  ON "training_lesson_progress" ("user_id", "completed_at");

CREATE TABLE IF NOT EXISTS "training_quiz_attempt" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL,
  "block_id" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "passed" INTEGER NOT NULL,
  "answers_json" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("block_id") REFERENCES "training_block" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "training_quiz_attempt_user_block_idx"
  ON "training_quiz_attempt" ("user_id", "block_id", "created_at");

-- Per-user notifications (separate from announcement posts).

CREATE TABLE IF NOT EXISTS "notification" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "read_at" INTEGER,
  "source_type" TEXT,
  "source_id" TEXT,
  FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "notification_user_created_idx"
  ON "notification" ("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "notification_user_unread_idx"
  ON "notification" ("user_id", "read_at");

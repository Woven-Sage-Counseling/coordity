-- Track which announcements each employee has seen.

CREATE TABLE IF NOT EXISTS "announcement_read" (
  "user_id" TEXT NOT NULL,
  "announcement_id" TEXT NOT NULL,
  "read_at" INTEGER NOT NULL,
  PRIMARY KEY ("user_id", "announcement_id"),
  FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("announcement_id") REFERENCES "announcement" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "announcement_read_user_idx" ON "announcement_read" ("user_id");

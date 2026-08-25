CREATE TABLE IF NOT EXISTS "announcement_dismiss" (
  "user_id" TEXT NOT NULL,
  "announcement_id" TEXT NOT NULL,
  "dismissed_at" INTEGER NOT NULL,
  PRIMARY KEY ("user_id", "announcement_id"),
  FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("announcement_id") REFERENCES "announcement" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "announcement_dismiss_user_idx"
  ON "announcement_dismiss" ("user_id");

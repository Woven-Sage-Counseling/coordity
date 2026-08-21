-- Home-page announcements for the employee portal.

CREATE TABLE IF NOT EXISTS "announcement" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "archived_at" INTEGER,
  FOREIGN KEY ("created_by") REFERENCES "user" ("id")
);

CREATE INDEX IF NOT EXISTS "announcement_created_at_idx" ON "announcement" ("created_at");

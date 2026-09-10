-- Early access lead capture + platform inbox.

CREATE TABLE IF NOT EXISTS "early_access_request" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "practice_name" TEXT NOT NULL,
  "phone" TEXT,
  "title" TEXT,
  "message" TEXT,
  "status" TEXT NOT NULL DEFAULT 'new'
    CHECK ("status" IN ('new', 'reviewed')),
  "created_at" INTEGER NOT NULL,
  "reviewed_at" INTEGER,
  "reviewed_by" TEXT,
  FOREIGN KEY ("reviewed_by") REFERENCES "user" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "early_access_request_status_created_idx"
  ON "early_access_request" ("status", "created_at");

CREATE INDEX IF NOT EXISTS "early_access_request_created_idx"
  ON "early_access_request" ("created_at");

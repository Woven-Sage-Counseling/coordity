-- Time off requests submitted by employees and reviewed by admins.

CREATE TABLE IF NOT EXISTS "time_off_request" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "notes" TEXT,
  "reviewed_by" TEXT,
  "reviewed_at" INTEGER,
  "created_at" INTEGER NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "user" ("id"),
  FOREIGN KEY ("reviewed_by") REFERENCES "user" ("id")
);

CREATE TABLE IF NOT EXISTS "time_off_entry" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "request_id" TEXT NOT NULL,
  "entry_date" TEXT NOT NULL,
  "full_day" INTEGER NOT NULL DEFAULT 1,
  "start_time" TEXT,
  "end_time" TEXT,
  FOREIGN KEY ("request_id") REFERENCES "time_off_request" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "time_off_request_user_idx" ON "time_off_request" ("user_id");
CREATE INDEX IF NOT EXISTS "time_off_request_status_idx" ON "time_off_request" ("status");
CREATE INDEX IF NOT EXISTS "time_off_request_created_at_idx" ON "time_off_request" ("created_at");
CREATE INDEX IF NOT EXISTS "time_off_entry_request_idx" ON "time_off_entry" ("request_id");
CREATE INDEX IF NOT EXISTS "time_off_entry_date_idx" ON "time_off_entry" ("entry_date");

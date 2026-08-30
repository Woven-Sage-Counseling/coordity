-- Daily hours worked entries for employee timesheets.

CREATE TABLE IF NOT EXISTS "timesheet_entry" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL,
  "work_date" TEXT NOT NULL,
  "minutes" INTEGER NOT NULL,
  "notes" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "user" ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "timesheet_entry_user_date_idx"
  ON "timesheet_entry" ("user_id", "work_date");
CREATE INDEX IF NOT EXISTS "timesheet_entry_date_idx" ON "timesheet_entry" ("work_date");
CREATE INDEX IF NOT EXISTS "timesheet_entry_user_idx" ON "timesheet_entry" ("user_id");

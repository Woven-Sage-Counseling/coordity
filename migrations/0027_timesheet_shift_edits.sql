-- Pending shift time corrections requiring admin approval.

CREATE TABLE IF NOT EXISTS "timesheet_shift_edit" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL,
  "shift_id" TEXT NOT NULL,
  "work_date" TEXT NOT NULL,
  "started_at" INTEGER NOT NULL,
  "ended_at" INTEGER NOT NULL,
  "minutes" INTEGER NOT NULL,
  "previous_started_at" INTEGER,
  "previous_ended_at" INTEGER,
  "previous_minutes" INTEGER NOT NULL,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'approved', 'denied')),
  "reviewed_by" TEXT,
  "reviewed_at" INTEGER,
  "created_at" INTEGER NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "user" ("id"),
  FOREIGN KEY ("shift_id") REFERENCES "timesheet_shift" ("id"),
  FOREIGN KEY ("reviewed_by") REFERENCES "user" ("id")
);

CREATE INDEX IF NOT EXISTS "timesheet_shift_edit_user_idx" ON "timesheet_shift_edit" ("user_id");
CREATE INDEX IF NOT EXISTS "timesheet_shift_edit_shift_idx" ON "timesheet_shift_edit" ("shift_id");
CREATE INDEX IF NOT EXISTS "timesheet_shift_edit_status_idx" ON "timesheet_shift_edit" ("status");

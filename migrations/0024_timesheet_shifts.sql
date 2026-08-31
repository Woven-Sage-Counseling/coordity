-- Shift-based timesheets with backlog approval.

CREATE TABLE IF NOT EXISTS "timesheet_shift" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL,
  "work_date" TEXT NOT NULL,
  "started_at" INTEGER,
  "ended_at" INTEGER,
  "minutes" INTEGER NOT NULL,
  "notes" TEXT,
  "source" TEXT NOT NULL DEFAULT 'clock' CHECK ("source" IN ('clock', 'backlog')),
  "backlog_id" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "user" ("id")
);

CREATE INDEX IF NOT EXISTS "timesheet_shift_user_idx" ON "timesheet_shift" ("user_id");
CREATE INDEX IF NOT EXISTS "timesheet_shift_work_date_idx" ON "timesheet_shift" ("work_date");
CREATE INDEX IF NOT EXISTS "timesheet_shift_user_date_idx" ON "timesheet_shift" ("user_id", "work_date");

CREATE TABLE IF NOT EXISTS "timesheet_backlog" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL,
  "work_date" TEXT NOT NULL,
  "minutes" INTEGER NOT NULL,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'approved', 'denied')),
  "reviewed_by" TEXT,
  "reviewed_at" INTEGER,
  "shift_id" TEXT,
  "created_at" INTEGER NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "user" ("id"),
  FOREIGN KEY ("reviewed_by") REFERENCES "user" ("id")
);

CREATE INDEX IF NOT EXISTS "timesheet_backlog_user_idx" ON "timesheet_backlog" ("user_id");
CREATE INDEX IF NOT EXISTS "timesheet_backlog_status_idx" ON "timesheet_backlog" ("status");

INSERT INTO "timesheet_shift" (
  "id",
  "user_id",
  "work_date",
  "started_at",
  "ended_at",
  "minutes",
  "notes",
  "source",
  "backlog_id",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "user_id",
  "work_date",
  "created_at",
  "updated_at",
  "minutes",
  "notes",
  'backlog',
  NULL,
  "created_at",
  "updated_at"
FROM "timesheet_entry";

DROP TABLE IF EXISTS "timesheet_entry";

-- Unpaid pause intervals within a clock shift.

CREATE TABLE IF NOT EXISTS "timesheet_shift_break" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "shift_id" TEXT NOT NULL,
  "started_at" INTEGER NOT NULL,
  "ended_at" INTEGER,
  "created_at" INTEGER NOT NULL,
  FOREIGN KEY ("shift_id") REFERENCES "timesheet_shift" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "timesheet_shift_break_shift_idx"
  ON "timesheet_shift_break" ("shift_id", "started_at");

CREATE INDEX IF NOT EXISTS "timesheet_shift_break_open_idx"
  ON "timesheet_shift_break" ("shift_id", "ended_at");

-- Work category breakdown per completed shift.

CREATE TABLE IF NOT EXISTS "timesheet_shift_work_item" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "shift_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "minutes" INTEGER NOT NULL,
  "created_at" INTEGER NOT NULL,
  FOREIGN KEY ("shift_id") REFERENCES "timesheet_shift" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "timesheet_shift_work_item_shift_idx" ON "timesheet_shift_work_item" ("shift_id");
CREATE UNIQUE INDEX IF NOT EXISTS "timesheet_shift_work_item_shift_category_idx"
  ON "timesheet_shift_work_item" ("shift_id", "category");

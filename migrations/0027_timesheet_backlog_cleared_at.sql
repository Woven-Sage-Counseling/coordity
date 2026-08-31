-- Let admins dismiss approved backlog cards without affecting user shift logs.

ALTER TABLE "timesheet_backlog" ADD COLUMN "cleared_at" INTEGER;

CREATE INDEX IF NOT EXISTS "timesheet_backlog_cleared_idx" ON "timesheet_backlog" ("cleared_at");

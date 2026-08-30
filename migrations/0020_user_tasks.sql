-- Personal and admin-assigned tasks for portal users.

CREATE TABLE IF NOT EXISTS "user_task" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "assignee_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "completed_at" INTEGER,
  "created_at" INTEGER NOT NULL,
  FOREIGN KEY ("assignee_id") REFERENCES "user" ("id"),
  FOREIGN KEY ("created_by") REFERENCES "user" ("id")
);

CREATE INDEX IF NOT EXISTS "user_task_assignee_idx" ON "user_task" ("assignee_id");
CREATE INDEX IF NOT EXISTS "user_task_created_by_idx" ON "user_task" ("created_by");
CREATE INDEX IF NOT EXISTS "user_task_completed_at_idx" ON "user_task" ("completed_at");
CREATE INDEX IF NOT EXISTS "user_task_created_at_idx" ON "user_task" ("created_at");

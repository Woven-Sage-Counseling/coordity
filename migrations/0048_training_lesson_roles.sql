-- Per-lesson / assignment role restrictions (subset of the parent module's roles).
-- Empty role set means inherit: visible to everyone who can see the module.

CREATE TABLE IF NOT EXISTS "training_lesson_role" (
  "lesson_id" TEXT NOT NULL,
  "role_key" TEXT NOT NULL,
  PRIMARY KEY ("lesson_id", "role_key"),
  FOREIGN KEY ("lesson_id") REFERENCES "training_lesson" ("id") ON DELETE CASCADE
);

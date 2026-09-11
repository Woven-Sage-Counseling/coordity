-- Module-level assignments reuse training_lesson rows with is_assignment = 1.
-- They appear on the module itself (not nested under the Lessons section).

ALTER TABLE "training_lesson" ADD COLUMN "is_assignment" INTEGER NOT NULL DEFAULT 0;

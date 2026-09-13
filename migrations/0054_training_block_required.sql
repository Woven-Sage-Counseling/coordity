-- Per-block required flag for lesson completion gating.
-- Interactive blocks stay required by default; content blocks start optional.

ALTER TABLE "training_block" ADD COLUMN "required" INTEGER NOT NULL DEFAULT 1;

UPDATE "training_block"
SET "required" = CASE
  WHEN "type" IN ('quiz', 'ack', 'docusign', 'contact') THEN 1
  ELSE 0
END;

-- Per-pin text size for bulletin board notes (rem units).

ALTER TABLE "bulletin_board_pin" ADD COLUMN "font_size_rem" REAL NOT NULL DEFAULT 1.05;

UPDATE "bulletin_board_pin"
SET "font_size_rem" = 1.35
WHERE "org_id" IN (
  SELECT "org_id" FROM "bulletin_board" WHERE "surface" = 'blackboard'
);

-- Per-user home composition prefs, rail_slot enum, dual board variants (portrait/landscape),
-- and duplicate vs separate board mode.

ALTER TABLE "home_layout" ADD COLUMN "rail_slot" TEXT NOT NULL DEFAULT 'board';

UPDATE "home_layout"
SET "rail_slot" = CASE
  WHEN "rail_board" = 1 THEN 'board'
  WHEN "rail_widgets" = 1 THEN 'widgets'
  WHEN "rail_image_kind" IN ('custom', 'company', 'portal') THEN "rail_image_kind"
  ELSE 'none'
END;

ALTER TABLE "bulletin_board" ADD COLUMN "board_mode" TEXT NOT NULL DEFAULT 'duplicate';

ALTER TABLE "bulletin_board_pin" ADD COLUMN "board_variant" TEXT NOT NULL DEFAULT 'portrait';
ALTER TABLE "bulletin_board_pin" ADD COLUMN "link_id" TEXT;

CREATE INDEX IF NOT EXISTS "bulletin_board_pin_org_channel_variant_idx"
  ON "bulletin_board_pin" ("org_id", "channel", "board_variant", "active", "z_index");

CREATE INDEX IF NOT EXISTS "bulletin_board_pin_link_idx"
  ON "bulletin_board_pin" ("link_id");

CREATE TABLE IF NOT EXISTS "home_user_prefs" (
  "user_id" TEXT PRIMARY KEY NOT NULL,
  "org_id" TEXT NOT NULL,
  "surface_override" TEXT,
  "rail_slot" TEXT,
  "below_slot" TEXT,
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("org_id") REFERENCES "organization" ("id") ON DELETE CASCADE
);

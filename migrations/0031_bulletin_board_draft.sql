-- Draft admin workspace vs live Home board.
-- Lab edits draft_*; Home reads live surface + live pins.
-- Publishing copies draft pins onto the live channel.

ALTER TABLE "bulletin_board" ADD COLUMN "draft_surface" TEXT;
UPDATE "bulletin_board" SET "draft_surface" = "surface" WHERE "draft_surface" IS NULL;

ALTER TABLE "bulletin_board" ADD COLUMN "published_at" INTEGER;
UPDATE "bulletin_board" SET "published_at" = "updated_at" WHERE "published_at" IS NULL;

ALTER TABLE "bulletin_board" ADD COLUMN "draft_updated_at" INTEGER;
UPDATE "bulletin_board" SET "draft_updated_at" = "updated_at" WHERE "draft_updated_at" IS NULL;

ALTER TABLE "bulletin_board_pin" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'live';

CREATE INDEX IF NOT EXISTS "bulletin_board_pin_org_channel_active_idx"
  ON "bulletin_board_pin" ("org_id", "channel", "active", "z_index");

INSERT INTO "bulletin_board_pin" (
  "id", "org_id", "request_id", "kind", "body", "file_name", "file_mime", "file_data",
  "x_pct", "y_pct", "width_pct", "rotation_deg", "color", "font_size_rem", "z_index",
  "expires_at", "active", "created_by", "created_at", "updated_at", "channel"
)
SELECT
  lower(hex(randomblob(16))),
  "org_id", "request_id", "kind", "body", "file_name", "file_mime", "file_data",
  "x_pct", "y_pct", "width_pct", "rotation_deg", "color", "font_size_rem", "z_index",
  "expires_at", "active", "created_by", "created_at", "updated_at", 'draft'
FROM "bulletin_board_pin"
WHERE "channel" = 'live' AND "active" = 1;

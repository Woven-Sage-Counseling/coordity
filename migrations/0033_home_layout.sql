-- Home rail / below layout + board orientation for the bulletin board.

CREATE TABLE IF NOT EXISTS "home_layout" (
  "org_id" TEXT PRIMARY KEY NOT NULL,
  "rail_board" INTEGER NOT NULL DEFAULT 1,
  "rail_widgets" INTEGER NOT NULL DEFAULT 0,
  "rail_image_kind" TEXT NOT NULL DEFAULT 'none'
    CHECK ("rail_image_kind" IN ('none', 'custom', 'company', 'portal')),
  "rail_image_mime" TEXT,
  "rail_image_data" TEXT,
  "below_slot" TEXT NOT NULL DEFAULT 'widgets'
    CHECK ("below_slot" IN ('none', 'board', 'widgets')),
  "board_shape" TEXT NOT NULL DEFAULT 'portrait'
    CHECK ("board_shape" IN ('portrait', 'landscape')),
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("org_id") REFERENCES "organization" ("id") ON DELETE CASCADE
);

INSERT OR IGNORE INTO "home_layout" (
  "org_id", "rail_board", "rail_widgets", "rail_image_kind",
  "below_slot", "board_shape", "updated_at"
) VALUES (
  'org_wovensage', 1, 0, 'none', 'widgets', 'portrait', 1756500000000
);

-- Digital bulletin board: surface, submission requests, and freeform pins.

CREATE TABLE IF NOT EXISTS "bulletin_board" (
  "org_id" TEXT PRIMARY KEY NOT NULL,
  "surface" TEXT NOT NULL DEFAULT 'cork' CHECK ("surface" IN ('cork', 'blackboard', 'whiteboard')),
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("org_id") REFERENCES "organization" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "bulletin_board_request" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "org_id" TEXT NOT NULL,
  "submitted_by" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('text', 'image', 'pdf')),
  "body" TEXT,
  "file_name" TEXT,
  "file_mime" TEXT,
  "file_data" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'approved', 'rejected', 'cancelled')),
  "created_at" INTEGER NOT NULL,
  "reviewed_at" INTEGER,
  "reviewed_by" TEXT,
  "review_note" TEXT,
  FOREIGN KEY ("org_id") REFERENCES "organization" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("submitted_by") REFERENCES "user" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("reviewed_by") REFERENCES "user" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "bulletin_board_request_org_status_idx"
  ON "bulletin_board_request" ("org_id", "status", "created_at");

CREATE TABLE IF NOT EXISTS "bulletin_board_pin" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "org_id" TEXT NOT NULL,
  "request_id" TEXT,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('text', 'image', 'pdf')),
  "body" TEXT,
  "file_name" TEXT,
  "file_mime" TEXT,
  "file_data" TEXT,
  "x_pct" REAL NOT NULL DEFAULT 40,
  "y_pct" REAL NOT NULL DEFAULT 40,
  "width_pct" REAL NOT NULL DEFAULT 22,
  "rotation_deg" REAL NOT NULL DEFAULT 0,
  "color" TEXT NOT NULL,
  "z_index" INTEGER NOT NULL DEFAULT 1,
  "expires_at" INTEGER,
  "active" INTEGER NOT NULL DEFAULT 1,
  "created_by" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("org_id") REFERENCES "organization" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("request_id") REFERENCES "bulletin_board_request" ("id") ON DELETE SET NULL,
  FOREIGN KEY ("created_by") REFERENCES "user" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "bulletin_board_pin_org_active_idx"
  ON "bulletin_board_pin" ("org_id", "active", "z_index");

INSERT OR IGNORE INTO "bulletin_board" ("org_id", "surface", "updated_at")
VALUES ('org_wovensage', 'cork', 1756500000000);

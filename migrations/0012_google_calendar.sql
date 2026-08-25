CREATE TABLE IF NOT EXISTS "google_calendar_connection" (
  "user_id" TEXT PRIMARY KEY NOT NULL,
  "google_email" TEXT,
  "access_token_encrypted" TEXT,
  "refresh_token_encrypted" TEXT,
  "access_token_expires_at" INTEGER,
  "refresh_token_expires_at" INTEGER,
  "connected_at" INTEGER,
  "last_sync_at" INTEGER,
  "last_error" TEXT,
  "status" TEXT NOT NULL DEFAULT 'disconnected' CHECK ("status" IN ('disconnected', 'connected', 'error')),
  FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "google_calendar_selection" (
  "user_id" TEXT NOT NULL,
  "calendar_id" TEXT NOT NULL,
  "calendar_name" TEXT NOT NULL,
  "calendar_color" TEXT,
  "enabled" INTEGER NOT NULL DEFAULT 0,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("user_id", "calendar_id"),
  FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "google_calendar_event_cache" (
  "user_id" TEXT NOT NULL,
  "range_key" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "fetched_at" INTEGER NOT NULL,
  PRIMARY KEY ("user_id", "range_key"),
  FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);

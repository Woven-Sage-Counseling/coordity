-- Employee messaging: 1:1 DMs + org/team channels.

CREATE TABLE IF NOT EXISTS "message_conversation" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "org_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('dm', 'channel')),
  "title" TEXT,
  "team_id" TEXT,
  "channel_key" TEXT,
  "dm_key" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("org_id") REFERENCES "organization" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("team_id") REFERENCES "directory_team" ("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "message_conversation_dm_key_uidx"
  ON "message_conversation" ("dm_key")
  WHERE "dm_key" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "message_conversation_channel_key_uidx"
  ON "message_conversation" ("org_id", "channel_key")
  WHERE "channel_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "message_conversation_updated_idx"
  ON "message_conversation" ("updated_at" DESC);

CREATE TABLE IF NOT EXISTS "message_participant" (
  "conversation_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "joined_at" INTEGER NOT NULL,
  "last_read_at" INTEGER NOT NULL DEFAULT 0,
  "muted" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("conversation_id", "user_id"),
  FOREIGN KEY ("conversation_id") REFERENCES "message_conversation" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "message_participant_user_idx"
  ON "message_participant" ("user_id");

CREATE TABLE IF NOT EXISTS "message" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "sender_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  FOREIGN KEY ("conversation_id") REFERENCES "message_conversation" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("sender_id") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "message_conversation_created_idx"
  ON "message" ("conversation_id", "created_at");

-- Seed General + one channel per directory team for the default org.
INSERT OR IGNORE INTO "message_conversation"
  ("id", "org_id", "kind", "title", "team_id", "channel_key", "dm_key", "created_at", "updated_at")
VALUES
  ('msgchan_general', 'org_wovensage', 'channel', 'General', NULL, 'general', NULL, 0, 0);

INSERT OR IGNORE INTO "message_conversation"
  ("id", "org_id", "kind", "title", "team_id", "channel_key", "dm_key", "created_at", "updated_at")
SELECT
  'msgchan_' || t."id",
  'org_wovensage',
  'channel',
  t."name",
  t."id",
  t."key",
  NULL,
  0,
  0
FROM "directory_team" t;

-- Org membership + invitation tenancy for Coordity self-serve workspaces.

CREATE TABLE IF NOT EXISTS "organization_member" (
  "org_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  PRIMARY KEY ("org_id", "user_id"),
  FOREIGN KEY ("org_id") REFERENCES "organization" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "organization_member_user_idx"
  ON "organization_member" ("user_id");

ALTER TABLE "invitation" ADD COLUMN "org_id" TEXT REFERENCES "organization" ("id");

CREATE INDEX IF NOT EXISTS "invitation_org_idx"
  ON "invitation" ("org_id");

-- System actor for self-serve workspace invites (no login).
INSERT OR IGNORE INTO "user" (
  "id", "name", "email", "email_verified", "created_at", "updated_at"
) VALUES (
  'user_coordity_system',
  'Coordity',
  'system@coordity.com',
  1,
  '2026-01-01T00:00:00.000Z',
  '2026-01-01T00:00:00.000Z'
);

-- Existing portal users belong to Woven Sage.
INSERT OR IGNORE INTO "organization_member" ("org_id", "user_id", "created_at")
SELECT 'org_wovensage', u.id, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM "user" u
WHERE u.id != 'user_coordity_system';

UPDATE "invitation"
SET "org_id" = 'org_wovensage'
WHERE "org_id" IS NULL;

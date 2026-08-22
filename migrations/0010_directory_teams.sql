-- Directory teams (independent of portal roles). People can belong to more than one team.

CREATE TABLE IF NOT EXISTS "directory_team" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "key" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_team" (
  "user_id" TEXT NOT NULL,
  "team_id" TEXT NOT NULL,
  PRIMARY KEY ("user_id", "team_id"),
  FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("team_id") REFERENCES "directory_team" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "user_team_team_idx" ON "user_team" ("team_id");

INSERT OR IGNORE INTO "directory_team" ("id", "key", "name", "sort_order") VALUES
  ('team_owners', 'owners', 'Owners', 0),
  ('team_management', 'management', 'Management', 1),
  ('team_financial', 'financial', 'Financial', 2),
  ('team_marketing', 'marketing', 'Marketing', 3),
  ('team_clinical', 'clinical', 'Clinical', 4);

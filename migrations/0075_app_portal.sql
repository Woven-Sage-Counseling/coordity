CREATE TABLE app_portal (
  org_id TEXT PRIMARY KEY,
  background TEXT NOT NULL,
  surface TEXT NOT NULL,
  accent TEXT NOT NULL,
  ink TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organization (id)
);

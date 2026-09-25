-- Uploaded images for custom quick links. The website icon stays a URL on portal_quick_link.icon_src.

CREATE TABLE IF NOT EXISTS "portal_quick_link_icon" (
  "link_id" TEXT PRIMARY KEY NOT NULL,
  "mime" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY ("link_id") REFERENCES "portal_quick_link" ("id") ON DELETE CASCADE
);

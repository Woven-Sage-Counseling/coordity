-- Light and dark theme colors: background, primary, accent.

ALTER TABLE "organization" ADD COLUMN "bg_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "bg_color_dark" TEXT;
ALTER TABLE "organization" ADD COLUMN "primary_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "primary_color_dark" TEXT;
ALTER TABLE "organization" ADD COLUMN "accent_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "accent_color_dark" TEXT;

-- Carry forward any single-theme colors already saved.
UPDATE "organization"
SET "primary_color_light" = COALESCE("primary_color_light", "primary_color"),
    "accent_color_light" = COALESCE("accent_color_light", "accent_color")
WHERE "primary_color" IS NOT NULL OR "accent_color" IS NOT NULL;

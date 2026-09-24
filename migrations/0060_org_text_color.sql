-- Body and heading text, separate from filled buttons (primary) and outline accents.

ALTER TABLE "organization" ADD COLUMN "text_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "text_color_dark" TEXT;

UPDATE "organization"
SET "text_color_light" = COALESCE("text_color_light", "primary_color_light", "primary_color"),
    "text_color_dark" = COALESCE("text_color_dark", "primary_color_dark", "primary_color_light", "primary_color")
WHERE "primary_color_light" IS NOT NULL
   OR "primary_color_dark" IS NOT NULL
   OR "primary_color" IS NOT NULL;

-- Card fill, plus the label colors on filled buttons and outline accents.

ALTER TABLE "organization" ADD COLUMN "surface_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "surface_color_dark" TEXT;
ALTER TABLE "organization" ADD COLUMN "primary_text_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "primary_text_color_dark" TEXT;
ALTER TABLE "organization" ADD COLUMN "accent_text_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "accent_text_color_dark" TEXT;

UPDATE "organization"
SET "surface_color_light" = COALESCE("surface_color_light", '#FFFFFF'),
    "surface_color_dark" = COALESCE("surface_color_dark", '#1E211E'),
    "primary_text_color_light" = COALESCE("primary_text_color_light", "bg_color_light", '#F7F4EE'),
    "primary_text_color_dark" = COALESCE("primary_text_color_dark", "bg_color_dark", '#111311'),
    "accent_text_color_light" = COALESCE("accent_text_color_light", "accent_color_light", "accent_color", '#788F75'),
    "accent_text_color_dark" = COALESCE("accent_text_color_dark", "accent_color_dark", "accent_color_light", "accent_color", '#8A9E86');

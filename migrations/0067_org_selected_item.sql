-- Selected menu and nav highlights: wash, text, and hover. Separate from button colors.

ALTER TABLE "organization" ADD COLUMN "selected_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "selected_color_dark" TEXT;
ALTER TABLE "organization" ADD COLUMN "selected_text_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "selected_text_color_dark" TEXT;
ALTER TABLE "organization" ADD COLUMN "selected_hover_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "selected_hover_color_dark" TEXT;

UPDATE "organization"
SET "selected_color_light" = COALESCE("selected_color_light",
      CASE
        WHEN "accent_color_light" IS NOT NULL AND length("accent_color_light") >= 7
          THEN substr("accent_color_light", 1, 7) || '33'
        ELSE '#788F7533'
      END),
    "selected_text_color_light" = COALESCE("selected_text_color_light", "text_color_light", '#535F51'),
    "selected_hover_color_light" = COALESCE("selected_hover_color_light",
      CASE
        WHEN "accent_color_light" IS NOT NULL AND length("accent_color_light") >= 7
          THEN substr("accent_color_light", 1, 7) || '1A'
        ELSE '#788F751A'
      END),
    "selected_color_dark" = COALESCE("selected_color_dark",
      CASE
        WHEN "accent_color_dark" IS NOT NULL AND length("accent_color_dark") >= 7
          THEN substr("accent_color_dark", 1, 7) || '33'
        ELSE '#8A9E8633'
      END),
    "selected_text_color_dark" = COALESCE("selected_text_color_dark", "text_color_dark", '#BAC6B6'),
    "selected_hover_color_dark" = COALESCE("selected_hover_color_dark",
      CASE
        WHEN "accent_color_dark" IS NOT NULL AND length("accent_color_dark") >= 7
          THEN substr("accent_color_dark", 1, 7) || '1A'
        ELSE '#8A9E861A'
      END);

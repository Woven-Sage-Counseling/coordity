-- Separate widget button colors from the top bar, and store hover colors for buttons.

ALTER TABLE "organization" ADD COLUMN "primary_hover_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "primary_hover_color_dark" TEXT;
ALTER TABLE "organization" ADD COLUMN "accent_hover_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "accent_hover_color_dark" TEXT;
ALTER TABLE "organization" ADD COLUMN "widget_button_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "widget_button_color_dark" TEXT;
ALTER TABLE "organization" ADD COLUMN "widget_button_text_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "widget_button_text_color_dark" TEXT;
ALTER TABLE "organization" ADD COLUMN "widget_button_hover_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "widget_button_hover_color_dark" TEXT;

UPDATE "organization"
SET "primary_hover_color_light" = COALESCE("primary_hover_color_light", "accent_color_light", '#788F75'),
    "primary_hover_color_dark" = COALESCE("primary_hover_color_dark", "accent_color_dark", '#8A9E86'),
    "accent_hover_color_light" = COALESCE(
      "accent_hover_color_light",
      CASE
        WHEN "accent_color_light" IS NULL THEN '#788F751A'
        WHEN length("accent_color_light") = 7 THEN "accent_color_light" || '1A'
        ELSE "accent_color_light"
      END
    ),
    "accent_hover_color_dark" = COALESCE(
      "accent_hover_color_dark",
      CASE
        WHEN "accent_color_dark" IS NULL THEN '#8A9E861A'
        WHEN length("accent_color_dark") = 7 THEN "accent_color_dark" || '1A'
        ELSE "accent_color_dark"
      END
    ),
    "widget_button_color_light" = COALESCE("widget_button_color_light", "widget_header_color_light", '#535F51'),
    "widget_button_color_dark" = COALESCE("widget_button_color_dark", "widget_header_color_dark", '#535F51');

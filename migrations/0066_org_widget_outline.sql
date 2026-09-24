-- Outlined buttons on widgets: border, text, and hover, separate from filled widget buttons.

ALTER TABLE "organization" ADD COLUMN "widget_outline_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "widget_outline_color_dark" TEXT;
ALTER TABLE "organization" ADD COLUMN "widget_outline_text_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "widget_outline_text_color_dark" TEXT;
ALTER TABLE "organization" ADD COLUMN "widget_outline_hover_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "widget_outline_hover_color_dark" TEXT;

UPDATE "organization"
SET "widget_outline_color_light" = COALESCE("widget_outline_color_light", '#535F5140'),
    "widget_outline_text_color_light" = COALESCE("widget_outline_text_color_light", '#535F51CC'),
    "widget_outline_hover_color_light" = COALESCE("widget_outline_hover_color_light", '#535F511A'),
    "widget_outline_color_dark" = COALESCE("widget_outline_color_dark", '#BAC6B666'),
    "widget_outline_text_color_dark" = COALESCE("widget_outline_text_color_dark", '#BAC6B6'),
    "widget_outline_hover_color_dark" = COALESCE("widget_outline_hover_color_dark", '#BAC6B61A');

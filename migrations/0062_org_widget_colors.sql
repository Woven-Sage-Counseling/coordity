-- Default home-widget header bar and the background behind widget content.

ALTER TABLE "organization" ADD COLUMN "widget_header_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "widget_header_color_dark" TEXT;
ALTER TABLE "organization" ADD COLUMN "widget_bg_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "widget_bg_color_dark" TEXT;

UPDATE "organization"
SET "widget_header_color_light" = COALESCE("widget_header_color_light", '#535F51'),
    "widget_header_color_dark" = COALESCE("widget_header_color_dark", '#535F51'),
    "widget_bg_color_light" = COALESCE("widget_bg_color_light", '#F4F5F8'),
    "widget_bg_color_dark" = COALESCE("widget_bg_color_dark", '#252925');

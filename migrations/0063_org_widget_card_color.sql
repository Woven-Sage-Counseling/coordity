-- Color of the cards inside home widgets, separate from the page card color.

ALTER TABLE "organization" ADD COLUMN "widget_card_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "widget_card_color_dark" TEXT;

UPDATE "organization"
SET "widget_card_color_light" = COALESCE("widget_card_color_light", "surface_color_light", '#FFFFFF'),
    "widget_card_color_dark" = COALESCE("widget_card_color_dark", "surface_color_dark", '#1E211E');

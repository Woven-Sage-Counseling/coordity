-- Soft "shadowed" bubbles, separate from filled and outlined bubbles.

ALTER TABLE "organization" ADD COLUMN "shadow_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "shadow_color_dark" TEXT;
ALTER TABLE "organization" ADD COLUMN "shadow_text_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "shadow_text_color_dark" TEXT;
ALTER TABLE "organization" ADD COLUMN "shadow_hover_color_light" TEXT;
ALTER TABLE "organization" ADD COLUMN "shadow_hover_color_dark" TEXT;

UPDATE "organization"
SET "shadow_color_light" = COALESCE(
      "shadow_color_light",
      CASE
        WHEN "accent_color_light" IS NULL THEN '#788F752E'
        WHEN length("accent_color_light") = 7 THEN "accent_color_light" || '2E'
        ELSE "accent_color_light"
      END
    ),
    "shadow_color_dark" = COALESCE(
      "shadow_color_dark",
      CASE
        WHEN "accent_color_dark" IS NULL THEN '#8A9E8638'
        WHEN length("accent_color_dark") = 7 THEN "accent_color_dark" || '38'
        ELSE "accent_color_dark"
      END
    ),
    "shadow_text_color_light" = COALESCE("shadow_text_color_light", "accent_text_color_light", "accent_color_light", '#788F75'),
    "shadow_text_color_dark" = COALESCE("shadow_text_color_dark", "accent_text_color_dark", "accent_color_dark", '#8A9E86'),
    "shadow_hover_color_light" = COALESCE(
      "shadow_hover_color_light",
      CASE
        WHEN "accent_color_light" IS NULL THEN '#788F7547'
        WHEN length("accent_color_light") = 7 THEN "accent_color_light" || '47'
        ELSE "accent_color_light"
      END
    ),
    "shadow_hover_color_dark" = COALESCE(
      "shadow_hover_color_dark",
      CASE
        WHEN "accent_color_dark" IS NULL THEN '#8A9E8652'
        WHEN length("accent_color_dark") = 7 THEN "accent_color_dark" || '52'
        ELSE "accent_color_dark"
      END
    );

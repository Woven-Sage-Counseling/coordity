-- Full workspace branding: logo blob + theme colors.

ALTER TABLE "organization" ADD COLUMN "logo_mime" TEXT;
ALTER TABLE "organization" ADD COLUMN "logo_data" TEXT;
ALTER TABLE "organization" ADD COLUMN "logo_updated_at" INTEGER;
ALTER TABLE "organization" ADD COLUMN "primary_color" TEXT;
ALTER TABLE "organization" ADD COLUMN "accent_color" TEXT;
ALTER TABLE "organization" ADD COLUMN "invert_logo_dark" INTEGER NOT NULL DEFAULT 0;

-- Profile pictures for account / directory.

ALTER TABLE "employee_profile" ADD COLUMN "avatar_mime" TEXT;
ALTER TABLE "employee_profile" ADD COLUMN "avatar_data" TEXT;
ALTER TABLE "employee_profile" ADD COLUMN "avatar_updated_at" INTEGER;

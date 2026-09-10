-- Track how an early access request was closed (invite vs deny).

ALTER TABLE "early_access_request" ADD COLUMN "resolution" TEXT;

ALTER TABLE "google_calendar_connection"
  ADD COLUMN "hidden_title_keywords" TEXT NOT NULL DEFAULT '[]';

ALTER TABLE "google_calendar_connection"
  ADD COLUMN "hide_out_of_office" INTEGER NOT NULL DEFAULT 0;

-- After switching org default to Coordity logo, drop personal right-header
-- overrides that still force the old tall bulletin board so Home follows the new default.

UPDATE "home_user_prefs"
SET
  "rail_slot" = NULL,
  "updated_at" = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE "rail_slot" = 'board';

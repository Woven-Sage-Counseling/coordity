-- Default right header: Coordity logo (grey page arcs) instead of tall bulletin board.
-- Only flip orgs still on the original seed pair (board + widgets).

UPDATE "home_layout"
SET
  "rail_slot" = 'portal',
  "rail_board" = 0,
  "rail_widgets" = 0,
  "rail_image_kind" = 'portal',
  "board_shape" = 'portrait',
  "updated_at" = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE "rail_slot" = 'board'
  AND "below_slot" = 'widgets';

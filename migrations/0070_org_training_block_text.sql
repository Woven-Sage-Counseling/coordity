ALTER TABLE organization ADD COLUMN training_block_text_color_light TEXT;
ALTER TABLE organization ADD COLUMN training_block_text_color_dark TEXT;

UPDATE organization SET
  training_block_text_color_light = COALESCE(training_block_text_color_light, text_color_light, '#535F51'),
  training_block_text_color_dark = COALESCE(training_block_text_color_dark, text_color_dark, '#BAC6B6');

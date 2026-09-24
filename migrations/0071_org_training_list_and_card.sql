-- D1 allows 100 columns per table. Lesson-card text and hover are packed into
-- training_card_outline_color_* as #COLOR|#TEXT|#HOVER.
ALTER TABLE organization ADD COLUMN training_list_text_color_light TEXT;
ALTER TABLE organization ADD COLUMN training_list_text_color_dark TEXT;
ALTER TABLE organization ADD COLUMN training_card_outline_color_light TEXT;
ALTER TABLE organization ADD COLUMN training_card_outline_color_dark TEXT;

UPDATE organization SET
  training_list_text_color_light = COALESCE(training_list_text_color_light, text_color_light, '#535F51'),
  training_list_text_color_dark = COALESCE(training_list_text_color_dark, text_color_dark, '#BAC6B6'),
  training_card_outline_color_light = COALESCE(training_card_outline_color_light, training_outline_color_light, accent_color_light, '#788F75'),
  training_card_outline_color_dark = COALESCE(training_card_outline_color_dark, training_outline_color_dark, accent_color_dark, '#8A9E86');

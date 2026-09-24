ALTER TABLE organization ADD COLUMN training_header_color_light TEXT;
ALTER TABLE organization ADD COLUMN training_header_color_dark TEXT;
ALTER TABLE organization ADD COLUMN training_module_color_light TEXT;
ALTER TABLE organization ADD COLUMN training_module_color_dark TEXT;
ALTER TABLE organization ADD COLUMN training_module_text_color_light TEXT;
ALTER TABLE organization ADD COLUMN training_module_text_color_dark TEXT;
ALTER TABLE organization ADD COLUMN training_lesson_color_light TEXT;
ALTER TABLE organization ADD COLUMN training_lesson_color_dark TEXT;
ALTER TABLE organization ADD COLUMN training_lesson_text_color_light TEXT;
ALTER TABLE organization ADD COLUMN training_lesson_text_color_dark TEXT;
ALTER TABLE organization ADD COLUMN training_block_color_light TEXT;
ALTER TABLE organization ADD COLUMN training_block_color_dark TEXT;
ALTER TABLE organization ADD COLUMN training_field_color_light TEXT;
ALTER TABLE organization ADD COLUMN training_field_color_dark TEXT;
ALTER TABLE organization ADD COLUMN training_filled_color_light TEXT;
ALTER TABLE organization ADD COLUMN training_filled_color_dark TEXT;
ALTER TABLE organization ADD COLUMN training_filled_text_color_light TEXT;
ALTER TABLE organization ADD COLUMN training_filled_text_color_dark TEXT;
ALTER TABLE organization ADD COLUMN training_filled_hover_color_light TEXT;
ALTER TABLE organization ADD COLUMN training_filled_hover_color_dark TEXT;
ALTER TABLE organization ADD COLUMN training_outline_color_light TEXT;
ALTER TABLE organization ADD COLUMN training_outline_color_dark TEXT;
ALTER TABLE organization ADD COLUMN training_outline_text_color_light TEXT;
ALTER TABLE organization ADD COLUMN training_outline_text_color_dark TEXT;
ALTER TABLE organization ADD COLUMN training_outline_hover_color_light TEXT;
ALTER TABLE organization ADD COLUMN training_outline_hover_color_dark TEXT;

UPDATE organization SET
  training_header_color_light = COALESCE(training_header_color_light, selected_color_light, '#F7F8FA'),
  training_header_color_dark = COALESCE(training_header_color_dark, selected_color_dark, '#2A2E2A'),
  training_module_color_light = COALESCE(training_module_color_light, primary_color_light, '#535F51'),
  training_module_color_dark = COALESCE(training_module_color_dark, primary_color_dark, '#BAC6B6'),
  training_module_text_color_light = COALESCE(training_module_text_color_light, primary_text_color_light, '#F7F4EE'),
  training_module_text_color_dark = COALESCE(training_module_text_color_dark, primary_text_color_dark, '#111311'),
  training_lesson_color_light = COALESCE(training_lesson_color_light, CASE WHEN accent_color_light IS NOT NULL AND length(accent_color_light) >= 7 THEN substr(accent_color_light, 1, 7) || '40' ELSE '#788F7540' END),
  training_lesson_color_dark = COALESCE(training_lesson_color_dark, CASE WHEN accent_color_dark IS NOT NULL AND length(accent_color_dark) >= 7 THEN substr(accent_color_dark, 1, 7) || '40' ELSE '#8A9E8640' END),
  training_lesson_text_color_light = COALESCE(training_lesson_text_color_light, text_color_light, '#535F51'),
  training_lesson_text_color_dark = COALESCE(training_lesson_text_color_dark, text_color_dark, '#BAC6B6'),
  training_block_color_light = COALESCE(training_block_color_light, '#F7F8FA'),
  training_block_color_dark = COALESCE(training_block_color_dark, '#252925'),
  training_field_color_light = COALESCE(training_field_color_light, surface_color_light, '#FFFFFF'),
  training_field_color_dark = COALESCE(training_field_color_dark, surface_color_dark, '#1E211E'),
  training_filled_color_light = COALESCE(training_filled_color_light, primary_color_light, '#535F51'),
  training_filled_color_dark = COALESCE(training_filled_color_dark, primary_color_dark, '#BAC6B6'),
  training_filled_text_color_light = COALESCE(training_filled_text_color_light, primary_text_color_light, '#F7F4EE'),
  training_filled_text_color_dark = COALESCE(training_filled_text_color_dark, primary_text_color_dark, '#111311'),
  training_filled_hover_color_light = COALESCE(training_filled_hover_color_light, primary_hover_color_light, '#788F75'),
  training_filled_hover_color_dark = COALESCE(training_filled_hover_color_dark, primary_hover_color_dark, '#8A9E86'),
  training_outline_color_light = COALESCE(training_outline_color_light, accent_color_light, '#788F75'),
  training_outline_color_dark = COALESCE(training_outline_color_dark, accent_color_dark, '#8A9E86'),
  training_outline_text_color_light = COALESCE(training_outline_text_color_light, accent_text_color_light, accent_color_light, '#788F75'),
  training_outline_text_color_dark = COALESCE(training_outline_text_color_dark, accent_text_color_dark, accent_color_dark, '#8A9E86'),
  training_outline_hover_color_light = COALESCE(training_outline_hover_color_light, accent_hover_color_light, '#788F751A'),
  training_outline_hover_color_dark = COALESCE(training_outline_hover_color_dark, accent_hover_color_dark, '#8A9E861A');

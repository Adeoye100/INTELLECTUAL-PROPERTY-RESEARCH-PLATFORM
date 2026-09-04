-- Add alert_channel and alert_mode notification preferences to watches table.

ALTER TABLE watches
  ADD COLUMN IF NOT EXISTS alert_channel text NOT NULL DEFAULT 'in-app',
  ADD COLUMN IF NOT EXISTS alert_mode text NOT NULL DEFAULT 'real-time';

ALTER TABLE watches DROP CONSTRAINT IF EXISTS watches_alert_channel_valid;
ALTER TABLE watches ADD CONSTRAINT watches_alert_channel_valid CHECK (
  alert_channel IN ('email', 'in-app')
);

ALTER TABLE watches DROP CONSTRAINT IF EXISTS watches_alert_mode_valid;
ALTER TABLE watches ADD CONSTRAINT watches_alert_mode_valid CHECK (
  alert_mode IN ('real-time', 'digest')
);

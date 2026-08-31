ALTER TABLE notification_campaigns ADD COLUMN processing_at TEXT;
ALTER TABLE notification_campaigns ADD COLUMN cancelled_at TEXT;
ALTER TABLE notification_campaigns ADD COLUMN failure_reason TEXT;

CREATE INDEX IF NOT EXISTS notification_campaigns_processing_idx
  ON notification_campaigns(status, processing_at);

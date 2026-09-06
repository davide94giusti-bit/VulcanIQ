PRAGMA foreign_keys = ON;

-- Internal scan watermark keeps each scheduler run bounded while allowing fair
-- rotation across active owned bookings. It contains no participant data.
ALTER TABLE notification_subscription_ownership
  ADD COLUMN terms_reminder_checked_at TEXT;

CREATE INDEX IF NOT EXISTS notification_ownership_terms_scan_idx
  ON notification_subscription_ownership(
    revoked_at,
    reminders_enabled,
    terms_reminder_checked_at,
    id
  );

INSERT OR IGNORE INTO notification_automation_rules
  (rule_key,label_it,label_en,audience,category,enabled,offset_minutes,channel,quiet_hours_behavior,created_at,updated_at)
VALUES
  (
    'customer_participant_terms_reminder',
    'Completamento Termini partecipanti',
    'Participant Terms completion',
    'public',
    'customer_participant_terms_reminder',
    1,
    1440,
    'push_inapp',
    'defer',
    datetime('now'),
    datetime('now')
  );

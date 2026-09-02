PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS notification_automation_rules (
  rule_key TEXT PRIMARY KEY,
  label_it TEXT NOT NULL,
  label_en TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('public','admin')),
  category TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  offset_minutes INTEGER NOT NULL DEFAULT 0 CHECK (offset_minutes BETWEEN -525600 AND 525600),
  channel TEXT NOT NULL DEFAULT 'push_inapp' CHECK (channel IN ('push_inapp','inapp')),
  quiet_hours_behavior TEXT NOT NULL DEFAULT 'defer' CHECK (quiet_hours_behavior IN ('defer','bypass')),
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_jobs (
  id TEXT PRIMARY KEY,
  rule_key TEXT REFERENCES notification_automation_rules(rule_key) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_revision TEXT NOT NULL DEFAULT '1',
  recipient_subscription_id TEXT REFERENCES notification_subscriptions(id) ON DELETE CASCADE,
  audience TEXT NOT NULL CHECK (audience IN ('public','admin')),
  category TEXT NOT NULL,
  title_it TEXT NOT NULL,
  body_it TEXT NOT NULL,
  title_en TEXT NOT NULL,
  body_en TEXT NOT NULL,
  destination_url TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high','critical')),
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','processing','sent','failed','cancelled')),
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  processing_at TEXT,
  sent_at TEXT,
  cancelled_at TEXT,
  failure_reason TEXT,
  CHECK (audience = 'admin' OR recipient_subscription_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS notification_jobs_due_idx ON notification_jobs(status, scheduled_for);
CREATE INDEX IF NOT EXISTS notification_jobs_source_idx ON notification_jobs(source_type, source_id, status);
CREATE INDEX IF NOT EXISTS notification_jobs_recipient_idx ON notification_jobs(recipient_subscription_id, status);

INSERT OR IGNORE INTO notification_automation_rules
  (rule_key,label_it,label_en,audience,category,enabled,offset_minutes,channel,quiet_hours_behavior,created_at,updated_at)
VALUES
  ('admin_new_booking','Nuova prenotazione','New booking','admin','new_bookings',1,0,'push_inapp','defer',datetime('now'),datetime('now')),
  ('admin_gift_card','Aggiornamento Gift Card','Gift Card update','admin','gift_cards',1,0,'push_inapp','defer',datetime('now'),datetime('now')),
  ('admin_booking_code','Aggiornamento codice prenotazione','Booking code update','admin','booking_codes',1,0,'push_inapp','defer',datetime('now'),datetime('now')),
  ('admin_payment_reconciliation','Problema di riconciliazione','Reconciliation issue','admin','payment_reconciliation',1,0,'push_inapp','defer',datetime('now'),datetime('now')),
  ('admin_operational_failure','Problema operativo','Operational failure','admin','operational_failures',1,0,'push_inapp','defer',datetime('now'),datetime('now')),
  ('admin_security_alert','Avviso sicurezza','Security alert','admin','security_alerts',1,0,'push_inapp','bypass',datetime('now'),datetime('now'));

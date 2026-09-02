PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS notification_ownership_claims (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('booking_request')),
  entity_ref TEXT NOT NULL CHECK (length(entity_ref) = 64),
  journey_type TEXT NOT NULL CHECK (journey_type IN ('booking')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','expired','revoked')),
  claimed_subscription_id TEXT REFERENCES notification_subscriptions(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  claimed_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS notification_ownership_claims_entity_idx
  ON notification_ownership_claims(entity_type, entity_ref, status, expires_at);

CREATE TABLE IF NOT EXISTS notification_subscription_ownership (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL UNIQUE REFERENCES notification_ownership_claims(id) ON DELETE RESTRICT,
  subscription_id TEXT NOT NULL REFERENCES notification_subscriptions(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('booking_request')),
  entity_ref TEXT NOT NULL CHECK (length(entity_ref) = 64),
  journey_type TEXT NOT NULL CHECK (journey_type IN ('booking')),
  verified_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (subscription_id, entity_type, entity_ref)
);

CREATE INDEX IF NOT EXISTS notification_subscription_ownership_entity_idx
  ON notification_subscription_ownership(entity_type, entity_ref, revoked_at);
CREATE INDEX IF NOT EXISTS notification_subscription_ownership_subscription_idx
  ON notification_subscription_ownership(subscription_id, revoked_at);

CREATE TRIGGER IF NOT EXISTS notification_ownership_claim_match_insert
BEFORE INSERT ON notification_subscription_ownership
FOR EACH ROW
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM notification_ownership_claims c
    WHERE c.id = NEW.claim_id
      AND c.status = 'claimed'
      AND c.claimed_subscription_id = NEW.subscription_id
      AND c.entity_type = NEW.entity_type
      AND c.entity_ref = NEW.entity_ref
      AND c.journey_type = NEW.journey_type
  ) THEN RAISE(ABORT, 'ownership_claim_scope_mismatch') END);
END;

CREATE TABLE IF NOT EXISTS notification_personalized_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('booking_request')),
  entity_ref TEXT NOT NULL CHECK (length(entity_ref) = 64),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'booking_confirmed','payment_received','upcoming_reminder','operational_change',
    'booking_rescheduled','booking_cancelled','review_reminder'
  )),
  source_revision TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'processing','sent','scheduled','no_verified_recipient','invalid_business_state','failed','cancelled'
  )),
  dedupe_key TEXT NOT NULL UNIQUE,
  recipient_count INTEGER NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  job_count INTEGER NOT NULL DEFAULT 0 CHECK (job_count >= 0),
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS notification_personalized_events_entity_idx
  ON notification_personalized_events(entity_type, entity_ref, created_at);

ALTER TABLE notification_jobs
  ADD COLUMN ownership_id TEXT REFERENCES notification_subscription_ownership(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS notification_jobs_ownership_idx
  ON notification_jobs(ownership_id, status, scheduled_for);

CREATE TRIGGER IF NOT EXISTS notification_jobs_customer_ownership_insert
BEFORE INSERT ON notification_jobs
FOR EACH ROW WHEN NEW.category GLOB 'customer_*'
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM notification_subscription_ownership o
    WHERE o.id = NEW.ownership_id
      AND o.subscription_id = NEW.recipient_subscription_id
      AND o.revoked_at IS NULL
  ) THEN RAISE(ABORT, 'personalized_job_requires_active_ownership') END);
END;

CREATE TRIGGER IF NOT EXISTS notification_jobs_customer_ownership_update
BEFORE UPDATE OF category, ownership_id, recipient_subscription_id ON notification_jobs
FOR EACH ROW WHEN NEW.category GLOB 'customer_*'
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM notification_subscription_ownership o
    WHERE o.id = NEW.ownership_id
      AND o.subscription_id = NEW.recipient_subscription_id
      AND o.revoked_at IS NULL
  ) THEN RAISE(ABORT, 'personalized_job_requires_active_ownership') END);
END;

INSERT OR IGNORE INTO notification_automation_rules
  (rule_key,label_it,label_en,audience,category,enabled,offset_minutes,channel,quiet_hours_behavior,created_at,updated_at)
VALUES
  ('customer_booking_confirmed','Prenotazione confermata','Booking confirmed','public','customer_booking_confirmed',1,0,'push_inapp','defer',datetime('now'),datetime('now')),
  ('customer_payment_received','Pagamento ricevuto','Payment received','public','customer_payment_received',1,0,'push_inapp','defer',datetime('now'),datetime('now')),
  ('customer_upcoming_reminder','Promemoria attività','Upcoming activity reminder','public','customer_upcoming_reminder',1,-1440,'push_inapp','defer',datetime('now'),datetime('now')),
  ('customer_operational_change','Aggiornamento operativo','Operational update','public','customer_operational_change',1,0,'push_inapp','defer',datetime('now'),datetime('now')),
  ('customer_booking_rescheduled','Prenotazione riprogrammata','Booking rescheduled','public','customer_booking_rescheduled',1,0,'push_inapp','defer',datetime('now'),datetime('now')),
  ('customer_booking_cancelled','Prenotazione annullata','Booking cancelled','public','customer_booking_cancelled',1,0,'push_inapp','defer',datetime('now'),datetime('now')),
  ('customer_review_reminder','Promemoria recensione','Review reminder','public','customer_review_reminder',1,0,'push_inapp','defer',datetime('now'),datetime('now'));

-- Additive only. Deploy before matching Pages/Worker; scheduling remains OFF.
ALTER TABLE notification_events ADD COLUMN recipient_cursor TEXT NOT NULL DEFAULT '';
ALTER TABLE notification_events ADD COLUMN fanout_complete INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_events ADD COLUMN recipient_subscription_id TEXT;
ALTER TABLE notification_events ADD COLUMN ownership_id TEXT;
ALTER TABLE notification_events ADD COLUMN rule_key TEXT;
ALTER TABLE notification_events ADD COLUMN language_target TEXT NOT NULL DEFAULT 'all';
ALTER TABLE notification_jobs ADD COLUMN lease_token TEXT;
ALTER TABLE notification_jobs ADD COLUMN lease_expires_at TEXT;
ALTER TABLE notification_jobs ADD COLUMN canonical_entity_id TEXT;
ALTER TABLE notification_jobs ADD COLUMN canonical_event_type TEXT;
ALTER TABLE notification_campaigns ADD COLUMN lease_token TEXT;
ALTER TABLE notification_campaigns ADD COLUMN lease_expires_at TEXT;
CREATE TABLE notification_recipient_deliveries (
  event_id TEXT NOT NULL REFERENCES notification_events(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES notification_subscriptions(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','leased','sending','retry','accepted','inapp_only','suppressed','failed','unknown')),
  lease_token TEXT,
  lease_expires_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  reason TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(event_id,subscription_id)
);
CREATE INDEX notification_recipient_due_idx ON notification_recipient_deliveries(event_id,state,next_attempt_at);
CREATE INDEX notification_recipient_lease_idx ON notification_recipient_deliveries(state,lease_expires_at);
CREATE INDEX notification_subscriptions_cursor_idx ON notification_subscriptions(audience,enabled,id,created_at);
CREATE INDEX notification_rate_limits_expiry_idx ON notification_rate_limits(window_started_at);
CREATE INDEX notification_claims_expiry_idx ON notification_ownership_claims(status,expires_at);

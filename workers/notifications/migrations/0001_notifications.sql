PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS notification_subscriptions (
  id TEXT PRIMARY KEY,
  audience TEXT NOT NULL CHECK (audience IN ('public','admin')),
  app_variant TEXT NOT NULL CHECK (app_variant IN ('public','admin')),
  admin_user_id TEXT,
  device_id TEXT NOT NULL,
  device_token_hash TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT,
  auth TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  platform TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(audience, device_id)
);
CREATE INDEX IF NOT EXISTS notification_subscriptions_audience_enabled_idx ON notification_subscriptions(audience, enabled);
CREATE INDEX IF NOT EXISTS notification_subscriptions_admin_user_idx ON notification_subscriptions(admin_user_id, enabled);
CREATE INDEX IF NOT EXISTS notification_subscriptions_device_idx ON notification_subscriptions(device_id, audience);

CREATE TABLE IF NOT EXISTS notification_preferences (
  subscription_id TEXT PRIMARY KEY REFERENCES notification_subscriptions(id) ON DELETE CASCADE,
  language_preference TEXT NOT NULL DEFAULT 'auto' CHECK (language_preference IN ('auto','it','en')),
  resolved_locale TEXT NOT NULL DEFAULT 'it' CHECK (resolved_locale IN ('it','en')),
  categories_json TEXT NOT NULL DEFAULT '[]',
  quiet_hours_enabled INTEGER NOT NULL DEFAULT 0 CHECK (quiet_hours_enabled IN (0,1)),
  quiet_start TEXT,
  quiet_end TEXT,
  timezone TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_events (
  id TEXT PRIMARY KEY,
  audience TEXT NOT NULL CHECK (audience IN ('public','admin')),
  category TEXT NOT NULL,
  origin TEXT NOT NULL,
  title_it TEXT NOT NULL,
  body_it TEXT NOT NULL,
  title_en TEXT NOT NULL,
  body_en TEXT NOT NULL,
  destination_url TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL,
  scheduled_for TEXT,
  sent_at TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
);
CREATE INDEX IF NOT EXISTS notification_events_schedule_idx ON notification_events(status, scheduled_for, created_at);
CREATE INDEX IF NOT EXISTS notification_events_audience_idx ON notification_events(audience, category, created_at);

CREATE TABLE IF NOT EXISTS notification_inbox (
  id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES notification_events(id) ON DELETE SET NULL,
  subscription_id TEXT NOT NULL REFERENCES notification_subscriptions(id) ON DELETE CASCADE,
  audience TEXT NOT NULL CHECK (audience IN ('public','admin')),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  destination_url TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT,
  dismissed_at TEXT
);
CREATE INDEX IF NOT EXISTS notification_inbox_subscription_idx ON notification_inbox(subscription_id, dismissed_at, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_inbox_unread_idx ON notification_inbox(subscription_id, read_at, dismissed_at);

CREATE TABLE IF NOT EXISTS notification_campaigns (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  category TEXT NOT NULL,
  title_it TEXT,
  body_it TEXT,
  title_en TEXT,
  body_en TEXT,
  destination_url TEXT,
  language_target TEXT NOT NULL DEFAULT 'all' CHECK (language_target IN ('all','it','en')),
  scheduled_for TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS notification_campaigns_schedule_idx ON notification_campaigns(status, scheduled_for);

CREATE TABLE IF NOT EXISTS notification_source_dedupe (
  dedupe_key TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_url TEXT,
  source_identifier TEXT,
  official_timestamp TEXT,
  retrieved_at TEXT NOT NULL,
  classification TEXT,
  content_hash TEXT
);
CREATE INDEX IF NOT EXISTS notification_source_timestamp_idx ON notification_source_dedupe(source, official_timestamp DESC);

CREATE TABLE IF NOT EXISTS notification_audit_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  audience TEXT,
  actor_id TEXT,
  subscription_id TEXT,
  campaign_id TEXT,
  outcome TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notification_audit_created_idx ON notification_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS notification_audit_event_idx ON notification_audit_log(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_usage_counters (
  counter_date TEXT NOT NULL,
  counter_key TEXT NOT NULL,
  counter_value INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(counter_date, counter_key)
);

CREATE TABLE IF NOT EXISTS notification_rate_limits (
  rate_key TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notification_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

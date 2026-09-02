PRAGMA foreign_keys = ON;

ALTER TABLE notification_subscription_ownership
  ADD COLUMN status_updates_enabled INTEGER NOT NULL DEFAULT 1 CHECK (status_updates_enabled IN (0,1));
ALTER TABLE notification_subscription_ownership
  ADD COLUMN operational_updates_enabled INTEGER NOT NULL DEFAULT 1 CHECK (operational_updates_enabled IN (0,1));
ALTER TABLE notification_subscription_ownership
  ADD COLUMN reminders_enabled INTEGER NOT NULL DEFAULT 1 CHECK (reminders_enabled IN (0,1));
ALTER TABLE notification_subscription_ownership
  ADD COLUMN review_reminders_enabled INTEGER NOT NULL DEFAULT 1 CHECK (review_reminders_enabled IN (0,1));
ALTER TABLE notification_subscription_ownership
  ADD COLUMN push_enabled INTEGER NOT NULL DEFAULT 1 CHECK (push_enabled IN (0,1));
ALTER TABLE notification_subscription_ownership
  ADD COLUMN inapp_enabled INTEGER NOT NULL DEFAULT 1 CHECK (inapp_enabled IN (0,1));

ALTER TABLE notification_jobs ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0);
ALTER TABLE notification_jobs ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10);
ALTER TABLE notification_jobs ADD COLUMN next_attempt_at TEXT;
ALTER TABLE notification_jobs ADD COLUMN last_attempt_at TEXT;
ALTER TABLE notification_jobs ADD COLUMN terminal_reason TEXT;
ALTER TABLE notification_jobs ADD COLUMN inbox_delivered_at TEXT;
ALTER TABLE notification_jobs ADD COLUMN push_started_at TEXT;
ALTER TABLE notification_jobs ADD COLUMN push_delivered_at TEXT;
ALTER TABLE notification_jobs ADD COLUMN dead_subscription_at TEXT;

CREATE INDEX IF NOT EXISTS notification_jobs_retry_idx
  ON notification_jobs(status, next_attempt_at, scheduled_for);

CREATE UNIQUE INDEX IF NOT EXISTS notification_inbox_event_subscription_unique
  ON notification_inbox(event_id, subscription_id)
  WHERE event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES notification_jobs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  transport TEXT NOT NULL CHECK (transport IN ('inapp','push')),
  outcome TEXT NOT NULL CHECK (outcome IN (
    'sent','skipped','retryable_error','permanent_error','outcome_unknown'
  )),
  http_status INTEGER,
  error_code TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (job_id, attempt_number, transport)
);

CREATE INDEX IF NOT EXISTS notification_delivery_attempts_job_idx
  ON notification_delivery_attempts(job_id, created_at);

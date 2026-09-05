-- Internal locator for participant management. It is never returned by public APIs.
-- Existing hashed ownerships remain valid and are intentionally not backfilled.
ALTER TABLE notification_ownership_claims
  ADD COLUMN entity_id TEXT CHECK (entity_id IS NULL OR (length(entity_id) = 36 AND substr(entity_id,9,1) = '-' AND substr(entity_id,14,1) = '-' AND substr(entity_id,19,1) = '-' AND substr(entity_id,24,1) = '-' AND entity_id NOT GLOB '*[^0-9a-fA-F-]*'));

ALTER TABLE notification_subscription_ownership
  ADD COLUMN entity_id TEXT CHECK (entity_id IS NULL OR (length(entity_id) = 36 AND substr(entity_id,9,1) = '-' AND substr(entity_id,14,1) = '-' AND substr(entity_id,19,1) = '-' AND substr(entity_id,24,1) = '-' AND entity_id NOT GLOB '*[^0-9a-fA-F-]*'));

DROP TRIGGER IF EXISTS notification_ownership_claim_match_insert;
CREATE TRIGGER notification_ownership_claim_match_insert
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
      AND c.entity_id IS NEW.entity_id
  ) THEN RAISE(ABORT, 'ownership_claim_scope_mismatch') END);
END;

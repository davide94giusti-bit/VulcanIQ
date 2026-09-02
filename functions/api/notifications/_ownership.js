const OWNABLE_ENTITY_TYPES = new Set(['booking_request']);
const OWNABLE_JOURNEY_TYPES = new Set(['booking']);
const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

function uuid() { return crypto.randomUUID(); }

function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isOwnershipClaimToken(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function ownershipClaimStateError(claim, now = Date.now()) {
  if (!claim) return 'ownership_claim_invalid';
  if (claim.status === 'revoked') return 'ownership_claim_revoked';
  if (claim.status === 'expired' || !Number.isFinite(Date.parse(claim.expires_at)) || Date.parse(claim.expires_at) <= now) return 'ownership_claim_expired';
  if (claim.status === 'claimed') return 'ownership_claim_already_claimed';
  return claim.status === 'pending' ? null : 'ownership_claim_invalid';
}

export async function notificationEntityRef(entityType, entityId) {
  if (!OWNABLE_ENTITY_TYPES.has(entityType) || typeof entityId !== 'string' || !entityId.trim()) throw new Error('invalid_owned_entity');
  return sha256Hex(`${entityType}:${entityId.trim()}`);
}

export async function issueNotificationOwnershipClaim(database, { entityType, entityId, journeyType, expiresInMs = CLAIM_TTL_MS }) {
  if (!database || !OWNABLE_ENTITY_TYPES.has(entityType) || !OWNABLE_JOURNEY_TYPES.has(journeyType)) return null;
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const entityRef = await notificationEntityRef(entityType, entityId);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(60_000, Math.min(CLAIM_TTL_MS, Number(expiresInMs) || CLAIM_TTL_MS))).toISOString();
  const id = uuid();
  await database.prepare(`INSERT INTO notification_ownership_claims
    (id,token_hash,entity_type,entity_ref,journey_type,status,expires_at,created_at)
    VALUES(?,?,?,?,?,'pending',?,?)`)
    .bind(id, tokenHash, entityType, entityRef, journeyType, expiresAt, now.toISOString()).run();
  return { token, expiresAt, entityType, journeyType };
}

export const OWNERSHIP_CLAIM_TTL_MS = CLAIM_TTL_MS;

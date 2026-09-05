const PARTICIPANT_TERMS_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export const PARTICIPANT_TERMS_INVITATION_TTL_MS = 24 * 60 * 60 * 1000;

export function createParticipantTermsToken(byteLength = 32) {
  if (!Number.isInteger(byteLength) || byteLength < 32) throw new Error('participant_terms_entropy_insufficient');
  if (byteLength !== 32) throw new Error('participant_terms_entropy_invalid');
  const value = new Uint8Array(byteLength);
  crypto.getRandomValues(value);
  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isParticipantTermsToken(value) {
  return typeof value === 'string' && PARTICIPANT_TERMS_TOKEN_PATTERN.test(value);
}

export async function participantTermsTokenHash(value) {
  if (!isParticipantTermsToken(value)) throw new Error('participant_terms_token_invalid');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function participantTermsAcceptanceUrl(request, token) {
  if (!isParticipantTermsToken(token)) throw new Error('participant_terms_token_invalid');
  const requestUrl = new URL(request.url);
  const url = new URL('/terms-acceptance', requestUrl.origin);
  url.hash = `token=${token}`;
  return url.toString();
}

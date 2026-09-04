function base64UrlToBytes(value = '') {
  const encoded = String(value).trim();
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('invalid_base64url');
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function jsonBase64Url(value) { return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value))); }
function presentationText(value, maxLength) {
  if (typeof value !== 'string') return '';
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length > maxLength) return '';
  if (/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/i.test(cleaned)) return '';
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(cleaned)) return '';
  if (/(?:\+?\d[\s().-]*){7,}/.test(cleaned)) return '';
  return cleaned;
}
function presentationCategory(value) {
  const category = typeof value === 'string' ? value.trim() : '';
  return /^[a-z][a-z0-9_]{0,59}$/.test(category) ? category : '';
}
function presentationUrl(value) {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url || url.length > 500 || !url.startsWith('/') || url.startsWith('//') || url.includes('\\') || /[\u0000-\u001f\u007f]/.test(url)) return '/install';
  if (/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/i.test(url)) return '/install';
  return url;
}
function pushPayload(notification) {
  const payload = { type: 'vulcaniq-notification' };
  if (!notification || typeof notification !== 'object' || Array.isArray(notification)) return payload;
  const title = presentationText(notification.title, 100);
  const body = presentationText(notification.body, 240);
  if (!title || !body) return payload;
  const category = presentationCategory(notification.category);
  return { ...payload, ...(category ? { category } : {}), title, body, url: presentationUrl(notification.url) };
}
function concatBytes(...parts) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
async function hkdf(input, salt, info, length) {
  const key = await crypto.subtle.importKey('raw', input, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

async function vapidJwt(endpoint, env = {}) {
  const publicKey = String(env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(env.VAPID_PRIVATE_KEY || '').trim();
  const subject = String(env.VAPID_SUBJECT || 'mailto:notifications@vulcaniq.it').trim();
  if (!publicKey || !privateKey) throw new Error('vapid_not_configured');
  const endpointUrl = new URL(endpoint);
  if (endpointUrl.protocol !== 'https:') throw new Error('invalid_push_endpoint');
  let subjectUrl;
  try { subjectUrl = new URL(subject); } catch { throw new Error('invalid_vapid_subject'); }
  if (!['mailto:', 'https:'].includes(subjectUrl.protocol)) throw new Error('invalid_vapid_subject');
  const publicBytes = base64UrlToBytes(publicKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) throw new Error('invalid_vapid_public_key');
  const d = base64UrlToBytes(privateKey);
  if (d.length !== 32) throw new Error('invalid_vapid_private_key');
  const key = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', x: bytesToBase64Url(publicBytes.slice(1, 33)), y: bytesToBase64Url(publicBytes.slice(33, 65)), d: bytesToBase64Url(d), ext: true
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const audience = endpointUrl.origin;
  const now = Math.floor(Date.now() / 1000);
  const encoded = `${jsonBase64Url({ typ: 'JWT', alg: 'ES256' })}.${jsonBase64Url({ aud: audience, exp: now + 12 * 60 * 60, sub: subject })}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(encoded)));
  return { token: `${encoded}.${bytesToBase64Url(signature)}`, publicKey };
}

async function encryptedPushBody(subscription, payload) {
  const userPublic = base64UrlToBytes(subscription?.p256dh);
  const authSecret = base64UrlToBytes(subscription?.auth);
  if (userPublic.length !== 65 || userPublic[0] !== 4) throw new Error('invalid_push_p256dh');
  if (authSecret.length !== 16) throw new Error('invalid_push_auth');
  const plaintext = typeof payload === 'string' ? new TextEncoder().encode(payload) : new Uint8Array(payload || []);
  if (!plaintext.length || plaintext.length > 3993) throw new Error('invalid_push_payload');

  const applicationKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const userKey = await crypto.subtle.importKey('raw', userPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const applicationPublic = new Uint8Array(await crypto.subtle.exportKey('raw', applicationKeys.publicKey));
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: userKey }, applicationKeys.privateKey, 256));
  const keyInfo = concatBytes(new TextEncoder().encode('WebPush: info'), Uint8Array.of(0), userPublic, applicationPublic);
  const inputKeyMaterial = await hkdf(sharedSecret, authSecret, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await hkdf(inputKeyMaterial, salt, concatBytes(new TextEncoder().encode('Content-Encoding: aes128gcm'), Uint8Array.of(0)), 16);
  const nonce = await hkdf(inputKeyMaterial, salt, concatBytes(new TextEncoder().encode('Content-Encoding: nonce'), Uint8Array.of(0)), 12);
  const aesKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
  const record = concatBytes(plaintext, Uint8Array.of(2));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, record));
  const header = new Uint8Array(21 + applicationPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = applicationPublic.length;
  header.set(applicationPublic, 21);
  return concatBytes(header, ciphertext);
}

const SAFE_ERRORS = new Set([
  'missing_endpoint', 'vapid_not_configured', 'invalid_vapid_public_key', 'invalid_vapid_private_key',
  'invalid_vapid_subject', 'invalid_push_endpoint', 'invalid_push_p256dh', 'invalid_push_auth', 'invalid_push_payload'
]);
function failure(error) {
  const candidate = String(error?.message || '');
  const errorCode = SAFE_ERRORS.has(candidate) ? candidate : candidate === 'invalid_base64url' ? 'invalid_push_configuration' : 'push_transport_error';
  const unknown = errorCode === 'push_transport_error';
  return { ok: false, accepted: false, deliveryConfirmed: false, status: 0, dead: false, retryable: false, unknown, outcome: unknown ? 'outcome_unknown' : 'configuration_error', error: errorCode };
}

export async function sendWebPush(subscription, env = {}, options = {}) {
  if (!subscription?.endpoint) return failure(new Error('missing_endpoint'));
  try {
    const { token, publicKey } = await vapidJwt(subscription.endpoint, env);
    const payload = JSON.stringify(pushPayload(options.notification));
    const body = await encryptedPushBody(subscription, payload);
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${token}, k=${publicKey}`,
        TTL: String(Math.max(0, Number(options.ttl ?? 86400))),
        Urgency: options.urgency || 'normal',
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream'
      },
      body
    });
    const accepted = response.ok;
    const dead = response.status === 404 || response.status === 410;
    const retryable = response.status === 429 || response.status >= 500;
    return {
      ok: accepted,
      accepted,
      deliveryConfirmed: false,
      status: response.status,
      dead,
      retryable,
      unknown: false,
      outcome: accepted ? 'push_service_accepted' : dead ? 'permanent_error' : retryable ? 'retryable_error' : 'permanent_error'
    };
  } catch (error) {
    return failure(error);
  }
}

// Compatibility export for callers deployed before push payload encryption was introduced.
export const sendEmptyWebPush = sendWebPush;

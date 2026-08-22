function base64UrlToBytes(value = '') {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
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

async function vapidJwt(endpoint, env = {}) {
  const publicKey = String(env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(env.VAPID_PRIVATE_KEY || '').trim();
  const subject = String(env.VAPID_SUBJECT || 'mailto:notifications@vulcaniq.it').trim();
  if (!publicKey || !privateKey) throw new Error('vapid_not_configured');
  const publicBytes = base64UrlToBytes(publicKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) throw new Error('invalid_vapid_public_key');
  const d = base64UrlToBytes(privateKey);
  if (d.length !== 32) throw new Error('invalid_vapid_private_key');
  const key = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', x: bytesToBase64Url(publicBytes.slice(1, 33)), y: bytesToBase64Url(publicBytes.slice(33, 65)), d: bytesToBase64Url(d), ext: true
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const encoded = `${jsonBase64Url({ typ: 'JWT', alg: 'ES256' })}.${jsonBase64Url({ aud: audience, exp: now + 12 * 60 * 60, sub: subject })}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(encoded)));
  return { token: `${encoded}.${bytesToBase64Url(signature)}`, publicKey };
}

export async function sendEmptyWebPush(subscription, env = {}, options = {}) {
  if (!subscription?.endpoint) return { ok: false, status: 0, dead: false, error: 'missing_endpoint' };
  try {
    const { token, publicKey } = await vapidJwt(subscription.endpoint, env);
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${token}, k=${publicKey}`,
        TTL: String(Math.max(0, Number(options.ttl ?? 86400))),
        Urgency: options.urgency || 'normal',
        'Content-Length': '0'
      }
    });
    return { ok: response.ok, status: response.status, dead: response.status === 404 || response.status === 410 };
  } catch (error) {
    return { ok: false, status: 0, dead: false, error: String(error?.message || error) };
  }
}

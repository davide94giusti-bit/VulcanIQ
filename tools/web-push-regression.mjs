import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { sendWebPush } from '../shared/webPush.js';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
if (!globalThis.atob) globalThis.atob = (value) => Buffer.from(value, 'base64').toString('binary');
if (!globalThis.btoa) globalThis.btoa = (value) => Buffer.from(value, 'binary').toString('base64');

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const originalFetch = globalThis.fetch;
let passed = 0;
let failed = 0;

function base64Url(bytes) { return Buffer.from(bytes).toString('base64url'); }
function decodeBase64Url(value) { return new Uint8Array(Buffer.from(value, 'base64url')); }
function concat(...parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
async function hkdfExtract(salt, input) {
  const key = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, input));
}
async function hkdfExpand(keyBytes, info, length) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, concat(info, Uint8Array.of(1)))).slice(0, length);
}
async function fixture() {
  const vapidPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const vapidJwk = await crypto.subtle.exportKey('jwk', vapidPair.privateKey);
  const publicKey = concat(Uint8Array.of(4), decodeBase64Url(vapidJwk.x), decodeBase64Url(vapidJwk.y));
  const userPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const userPublic = new Uint8Array(await crypto.subtle.exportKey('raw', userPair.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  return {
    env: { VAPID_PUBLIC_KEY: base64Url(publicKey), VAPID_PRIVATE_KEY: vapidJwk.d, VAPID_SUBJECT: 'mailto:notifications@vulcaniq.it' },
    subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/test-token', p256dh: base64Url(userPublic), auth: base64Url(authSecret) },
    vapidPair, userPair, userPublic, authSecret
  };
}
async function capturePush(pushFixture, response = new Response(null, { status: 201 }), options = {}) {
  let request;
  globalThis.fetch = async (url, init) => { request = { url, init }; return response; };
  try { return { result: await sendWebPush(pushFixture.subscription, pushFixture.env, options), request }; }
  finally { globalThis.fetch = originalFetch; }
}
async function test(name, callback) {
  try { await callback(); passed += 1; console.log(`PASS  ${name}`); }
  catch (error) { failed += 1; console.error(`FAIL  ${name}: ${error.message}`); }
}

await test('missing endpoint fails safely without fetch', async () => {
  let fetched = false; globalThis.fetch = async () => { fetched = true; throw new Error('unexpected'); };
  try { const result = await sendWebPush({}, {}); assert.equal(result.error, 'missing_endpoint'); assert.equal(fetched, false); }
  finally { globalThis.fetch = originalFetch; }
});

await test('missing or malformed VAPID configuration fails closed', async () => {
  const pushFixture = await fixture();
  for (const env of [{}, { ...pushFixture.env, VAPID_PUBLIC_KEY: 'invalid' }, { ...pushFixture.env, VAPID_PRIVATE_KEY: 'invalid' }]) {
    let fetched = false; globalThis.fetch = async () => { fetched = true; throw new Error('unexpected'); };
    const result = await sendWebPush(pushFixture.subscription, env);
    assert.equal(result.accepted, false); assert.equal(result.status, 0); assert.equal(fetched, false);
  }
  globalThis.fetch = originalFetch;
});

await test('VAPID JWT uses bounded ES256 claims for the endpoint origin', async () => {
  const pushFixture = await fixture(); const before = Math.floor(Date.now() / 1000);
  const { request } = await capturePush(pushFixture);
  const match = request.init.headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.ok(match); assert.equal(match[2], pushFixture.env.VAPID_PUBLIC_KEY);
  const [encodedHeader, encodedClaims, encodedSignature] = match[1].split('.');
  const header = JSON.parse(decoder.decode(decodeBase64Url(encodedHeader)));
  const claims = JSON.parse(decoder.decode(decodeBase64Url(encodedClaims)));
  assert.equal(header.alg, 'ES256'); assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.sub, pushFixture.env.VAPID_SUBJECT); assert.ok(claims.exp > before); assert.ok(claims.exp <= before + 12 * 60 * 60 + 2);
  assert.equal(decodeBase64Url(encodedSignature).length, 64);
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pushFixture.vapidPair.publicKey, decodeBase64Url(encodedSignature), encoder.encode(`${encodedHeader}.${encodedClaims}`)), true);
});

await test('request uses an encrypted Web Push body without forcing Content-Length', async () => {
  const pushFixture = await fixture(); const { request } = await capturePush(pushFixture);
  assert.equal(request.init.method, 'POST'); assert.equal(request.init.headers.TTL, '86400'); assert.equal(request.init.headers.Urgency, 'normal');
  assert.equal(request.init.headers['Content-Encoding'], 'aes128gcm'); assert.equal(request.init.headers['Content-Type'], 'application/octet-stream');
  assert.equal(Object.keys(request.init.headers).some((name) => name.toLowerCase() === 'content-length'), false);
  assert.ok(request.init.body instanceof Uint8Array); assert.ok(request.init.body.length > 103);
});

await test('encrypted payload conforms to RFC 8291 and remains generic', async () => {
  const pushFixture = await fixture(); const { request } = await capturePush(pushFixture, new Response(null, { status: 201 }), { payload: 'forbidden-custom-data' }); const message = request.init.body;
  const salt = message.slice(0, 16); const recordSize = new DataView(message.buffer, message.byteOffset + 16, 4).getUint32(0); const keyLength = message[20];
  const applicationPublic = message.slice(21, 21 + keyLength); const ciphertext = message.slice(21 + keyLength);
  assert.equal(recordSize, 4096); assert.equal(keyLength, 65); assert.equal(applicationPublic[0], 4);
  const applicationKey = await crypto.subtle.importKey('raw', applicationPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: applicationKey }, pushFixture.userPair.privateKey, 256));
  const keyPrk = await hkdfExtract(pushFixture.authSecret, shared);
  const ikm = await hkdfExpand(keyPrk, concat(encoder.encode('WebPush: info'), Uint8Array.of(0), pushFixture.userPublic, applicationPublic), 32);
  const contentPrk = await hkdfExtract(salt, ikm);
  const contentKey = await hkdfExpand(contentPrk, concat(encoder.encode('Content-Encoding: aes128gcm'), Uint8Array.of(0)), 16);
  const nonce = await hkdfExpand(contentPrk, concat(encoder.encode('Content-Encoding: nonce'), Uint8Array.of(0)), 12);
  const aesKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['decrypt']);
  const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, ciphertext));
  assert.equal(plaintext.at(-1), 2); assert.deepEqual(JSON.parse(decoder.decode(plaintext.slice(0, -1))), { type: 'vulcaniq-notification' });
});

await test('push-service acceptance is not represented as browser delivery', async () => {
  const { result } = await capturePush(await fixture());
  assert.equal(result.ok, true); assert.equal(result.accepted, true); assert.equal(result.deliveryConfirmed, false); assert.equal(result.outcome, 'push_service_accepted');
});

await test('404 and 410 mark the subscription dead', async () => {
  for (const status of [404, 410]) { const { result } = await capturePush(await fixture(), new Response(null, { status })); assert.equal(result.dead, true); assert.equal(result.accepted, false); }
});

await test('429 and 5xx are classified retryable', async () => {
  for (const status of [429, 500, 503]) { const { result } = await capturePush(await fixture(), new Response(null, { status })); assert.equal(result.retryable, true); assert.equal(result.dead, false); }
});

await test('network errors are unknown and never expose transport secrets', async () => {
  const pushFixture = await fixture(); const leaked = `${pushFixture.subscription.endpoint} ${pushFixture.subscription.auth} ${pushFixture.env.VAPID_PRIVATE_KEY}`; const logs = [];
  const originalError = console.error; console.error = (...values) => logs.push(values.join(' ')); globalThis.fetch = async () => { throw new Error(leaked); };
  try { const result = await sendWebPush(pushFixture.subscription, pushFixture.env); const serialized = JSON.stringify(result); assert.equal(result.status, 0); assert.equal(result.unknown, true); assert.equal(result.error, 'push_transport_error'); assert.equal(logs.length, 0); for (const secret of [pushFixture.subscription.endpoint, pushFixture.subscription.auth, pushFixture.env.VAPID_PRIVATE_KEY]) assert.equal(serialized.includes(secret), false); }
  finally { console.error = originalError; globalThis.fetch = originalFetch; }
});

await test('malformed subscription encryption keys fail before fetch', async () => {
  const pushFixture = await fixture();
  for (const subscription of [{ ...pushFixture.subscription, p256dh: 'invalid' }, { ...pushFixture.subscription, auth: 'invalid' }]) {
    let fetched = false; globalThis.fetch = async () => { fetched = true; throw new Error('unexpected'); }; const result = await sendWebPush(subscription, pushFixture.env); assert.equal(result.accepted, false); assert.equal(fetched, false);
  }
  globalThis.fetch = originalFetch;
});

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);

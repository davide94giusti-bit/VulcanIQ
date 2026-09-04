import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
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
async function decryptPushPayload(pushFixture, message) {
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
  assert.equal(plaintext.at(-1), 2);
  return JSON.parse(decoder.decode(plaintext.slice(0, -1)));
}
async function runPublicServiceWorkerPush(data, locale = 'en') {
  const listeners = {}; const shown = [];
  const indexedDB = { open() {
    const request = { result: { transaction() { return { objectStore() { return { get() { const getRequest = {}; queueMicrotask(() => { getRequest.result = { locale }; getRequest.onsuccess?.(); }); return getRequest; } }; } }; }, close() {} } };
    queueMicrotask(() => request.onsuccess?.()); return request;
  } };
  const self = {
    addEventListener(type, listener) { listeners[type] = listener; },
    location: { origin: 'https://preview.vulcaniq.invalid' },
    registration: { async showNotification(title, options) { shown.push({ title, options }); } },
    clients: { async matchAll() { return []; }, async openWindow() {} }
  };
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), { self, indexedDB, URL, Promise, queueMicrotask });
  let pending;
  const event = { waitUntil(value) { pending = value; }, ...(data === undefined ? {} : { data: { json() { if (data instanceof Error) throw data; return data; } } }) };
  listeners.push(event); await pending;
  assert.equal(shown.length, 1);
  return shown[0];
}
async function runPublicServiceWorkerClick(url) {
  const listeners = {}; const opened = [];
  const self = {
    addEventListener(type, listener) { listeners[type] = listener; },
    location: { origin: 'https://preview.vulcaniq.invalid' },
    registration: { async showNotification() {} },
    clients: { async matchAll() { return []; }, async openWindow(target) { opened.push(target); } }
  };
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), { self, indexedDB: {}, URL, Promise, queueMicrotask });
  let pending; let closed = false;
  listeners.notificationclick({ notification: { data: { url }, close() { closed = true; } }, waitUntil(value) { pending = value; } });
  await pending; assert.equal(closed, true); assert.equal(opened.length, 1);
  return opened[0];
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
  assert.deepEqual(await decryptPushPayload(pushFixture, message), { type: 'vulcaniq-notification' });
});

await test('safe notification presentation is normalized and encrypted', async () => {
  const pushFixture = await fixture();
  const notification = { type: 'attacker-type', category: 'customer_booking_confirmed', title: ' Booking confirmed ', body: ' Your vulcanIQ booking has been confirmed. ', url: '/install?lang=en' };
  const { request } = await capturePush(pushFixture, new Response(null, { status: 201 }), { notification });
  assert.deepEqual(await decryptPushPayload(pushFixture, request.init.body), { type: 'vulcaniq-notification', category: 'customer_booking_confirmed', title: 'Booking confirmed', body: 'Your vulcanIQ booking has been confirmed.', url: '/install?lang=en' });
});

await test('invalid notification presentation fails back to the mandatory generic contract', async () => {
  const pushFixture = await fixture();
  const notification = { type: 'wrong', category: 'not valid!', title: { unsafe: true }, body: '', url: 'https://example.invalid/path' };
  const { request } = await capturePush(pushFixture, new Response(null, { status: 201 }), { notification });
  assert.deepEqual(await decryptPushPayload(pushFixture, request.init.body), { type: 'vulcaniq-notification' });
});

await test('helper defaults contain no PII-like or business identifier fields', async () => {
  const pushFixture = await fixture(); const { request } = await capturePush(pushFixture); const payload = await decryptPushPayload(pushFixture, request.init.body);
  for (const forbidden of ['booking_id', 'entity_id', 'ownership_id', 'claim', 'subscription_id', 'device_id', 'customer_name', 'email', 'phone', 'booking_code', 'gift_card_code', 'amount']) assert.equal(forbidden in payload, false);
});

await test('helper rejects obvious contact details and raw UUIDs from presentation', async () => {
  const pushFixture = await fixture();
  for (const notification of [
    { category: 'news', title: 'Contact guest@example.invalid', body: 'Safe body', url: '/install' },
    { category: 'news', title: 'Safe title', body: 'Call +41 79 123 45 67', url: '/install' }
  ]) {
    const { request } = await capturePush(pushFixture, new Response(null, { status: 201 }), { notification });
    assert.deepEqual(await decryptPushPayload(pushFixture, request.init.body), { type: 'vulcaniq-notification' });
  }
  const rawId = '01234567-89ab-cdef-0123-456789abcdef';
  const { request } = await capturePush(pushFixture, new Response(null, { status: 201 }), { notification: { category: 'news', title: 'Safe title', body: 'Safe body', url: `/install?booking=${rawId}` } });
  assert.equal((await decryptPushPayload(pushFixture, request.init.body)).url, '/install');
});

await test('valid public payload displays localized presentation and deterministic tag', async () => {
  const shown = await runPublicServiceWorkerPush({ type: 'vulcaniq-notification', category: 'customer_booking_confirmed', title: 'Booking confirmed', body: 'Your vulcanIQ booking has been confirmed.', url: '/install?lang=en' });
  assert.equal(shown.title, 'Booking confirmed'); assert.equal(shown.options.body, 'Your vulcanIQ booking has been confirmed.'); assert.equal(shown.options.data.url, '/install?lang=en'); assert.equal(shown.options.tag, 'vulcaniq-customer_booking_confirmed');
});

await test('empty public payload displays the safe localized fallback', async () => {
  const shown = await runPublicServiceWorkerPush(undefined);
  assert.equal(shown.title, 'VulcanIQ update'); assert.equal(shown.options.data.url, '/install'); assert.equal(shown.options.tag, 'vulcaniq-public-update');
});

await test('malformed public payload still displays the safe fallback', async () => {
  const shown = await runPublicServiceWorkerPush(new Error('malformed-json'));
  assert.equal(shown.title, 'VulcanIQ update'); assert.equal(shown.options.body, 'A new update is available. Open VulcanIQ for details.');
});

await test('public service worker rejects external and active-content destinations', async () => {
  for (const url of ['https://example.invalid/path', 'javascript:alert(1)', 'data:text/html,unsafe', '//example.invalid/path']) {
    const shown = await runPublicServiceWorkerPush({ type: 'vulcaniq-notification', category: 'news', title: 'Safe title', body: 'Safe body', url });
    assert.equal(shown.options.data.url, '/install');
  }
});

await test('notification click revalidates internal destinations', async () => {
  assert.equal(await runPublicServiceWorkerClick('/news'), '/news');
  for (const url of ['https://example.invalid/path', 'javascript:alert(1)', 'data:text/html,unsafe', '//example.invalid/path']) assert.equal(await runPublicServiceWorkerClick(url), '/install');
});

await test('invalid category uses the privacy-safe fallback tag', async () => {
  const shown = await runPublicServiceWorkerPush({ type: 'vulcaniq-notification', category: 'booking-123-private', title: 'Safe title', body: 'Safe body', url: '/install' });
  assert.equal(shown.options.tag, 'vulcaniq-public-update');
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

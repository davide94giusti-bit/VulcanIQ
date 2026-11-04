import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readBoundedText } from '../functions/api/_shared/requestSafety.js';
import { onRequest as middleware } from '../functions/_middleware.js';
import { verifyTurnstile, clientActorHash } from '../functions/api/public/_shared.js';
import { onRequestPost as redeem } from '../functions/api/public/booking-code-redeem.js';
import { onRequestPost as ingest } from '../functions/api/analytics/event.js';
import { artifactStream } from '../functions/api/admin/backup/_stream.js';
import { onRequestGet as backupStatus } from '../functions/api/admin/backup/status.js';
import { planRetention } from '../scripts/backup-retention.mjs';
import { completeness, projectInfo } from '../scripts/backup-metadata.mjs';
import { verifyBackup, isolatedRestoreTarget } from '../scripts/validate-backup.mjs';
import { deliverOperationalEmail } from '../supabase/functions/_shared/emailDelivery.js';
import { canonicalPublicPath, publicEventMetadata } from '../shared/analyticsTrust.js';
import { verifiedAdminStepUp } from '../functions/api/_shared/adminStepUp.js';
import { drainAdminNotificationHandoffs } from '../supabase/functions/_shared/adminHandoff.js';
import { isMissingColumn, isMissingFunction } from '../src/services/schemaCompatibility.js';
import { pathToFileURL } from 'node:url';
import { loadPublicChallenge, mountPublicChallenge } from '../src/features/privacy/publicChallenge.js';
import { completeRows } from '../supabase/functions/_shared/completeRows.js';
import { retentionSql } from '../scripts/analytics-retention.mjs';

let passed = 0;
async function test(name, action) { await action(); passed++; console.log(`PASS ${name}`); }
const originalFetch = globalThis.fetch;
const req = (body, url = 'https://vulcaniq.it/api/test') => new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const env = { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_fixture', SUBMISSION_HASH_SALT: 'synthetic-hmac-salt-at-least-32-characters' };

function metadataZip(info) {
  const name = Buffer.from('00_project_info.json'), data = Buffer.from(JSON.stringify(info));
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  crc = (crc ^ 0xffffffff) >>> 0;
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, central, name, end]);
}

try {
  await test('Chunked body stops at limit without reading entire stream', async () => {
    let reads = 0;
    const body = new ReadableStream({ pull(c) { reads++; c.enqueue(new Uint8Array(1024)); } });
    await assert.rejects(readBoundedText(new Request('https://test', { method: 'POST', body, duplex: 'half' }), 2048), /body_too_large/);
    assert.ok(reads <= 4);
  });
  await test('Body deadline cancels stalled input', async () => {
    await assert.rejects(readBoundedText(new Request('https://test', { method: 'POST', body: new ReadableStream({}), duplex: 'half' }), 2048, 5), /request_timeout/);
  });
  for (const [name, config, token, ok, error] of [
    ['optional absent', {}, null, true], ['enforced missing config', { TURNSTILE_ENFORCE: 'true' }, null, false, 'turnstile_not_configured'],
    ['enforced missing token', { TURNSTILE_ENFORCE: 'true', TURNSTILE_SECRET_KEY: 'fixture' }, null, false, 'turnstile_required']
  ]) await test(`Turnstile ${name}`, async () => { const result = await verifyTurnstile(req({}), config, token); assert.equal(result.ok, ok); if (error) assert.equal(result.error, error); });
  for (const [name, payload, ok] of [['matching', { success: true, hostname: 'vulcaniq.it', action: 'public_submission' }, true], ['wrong hostname', { success: true, hostname: 'attacker.test', action: 'public_submission' }, false], ['wrong action', { success: true, hostname: 'vulcaniq.it', action: 'other' }, false], ['replay', { success: false }, false]]) await test(`Turnstile ${name}`, async () => {
    globalThis.fetch = async () => Response.json(payload);
    assert.equal((await verifyTurnstile(req({}), { TURNSTILE_SECRET_KEY: 'fixture' }, 'synthetic')).ok, ok);
  });
  await test('Untrusted forwarded headers cannot rotate actor budget', async () => {
    const a = new Request('https://test', { headers: { 'CF-Connecting-IP': '1.2.3.4', 'X-Forwarded-For': 'one' } });
    const b = new Request('https://test', { headers: { 'CF-Connecting-IP': '5.6.7.8', 'X-Forwarded-For': 'two' } });
    assert.equal(await clientActorHash(a, env), await clientActorHash(b, env));
    await assert.rejects(clientActorHash(a, {}), /hash_salt_not_configured/);
  });
  await test('Public code rate denial performs no redemption call', async () => {
    const calls = []; globalThis.fetch = async (url) => { calls.push(url); return Response.json(false); };
    assert.equal((await redeem({ request: req({ booking_code: 'VUL-LEGACY-ABCD' }), env })).status, 429);
    assert.equal(calls.length, 1); assert.match(calls[0], /claim_public_submission_rate_limit/);
  });
  await test('Public code success strips internal IDs and contacts', async () => {
    globalThis.fetch = async (url) => Response.json(String(url).includes('claim_public') ? true : { ok: true, code: 'VUL-LEGACY-ABCD', customer_email: 'private@fixture.test', booking_request_id: 'private', finance_entry_id: 'private' });
    const body = await (await redeem({ request: req({ booking_code: 'VUL-LEGACY-ABCD' }), env })).json();
    assert.equal(body.ok, true); assert.equal(body.customer_email, undefined); assert.equal(body.booking_request_id, undefined); assert.equal(body.finance_entry_id, undefined);
  });
  for (const status of [200, 400, 500]) await test(`Function header matrix ${status}`, async () => {
    const response = await middleware({ request: req({}), next: async () => new Response('safe', { status }) });
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY'); assert.equal(response.headers.get('Cache-Control'), 'no-store'); assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  });
  await test('Preliminary dependency failure returns safe JSON and trace', async () => {
    const response = await middleware({ request: req({}), next: async () => { throw new Error('SECRET-fixture-customer'); } });
    assert.equal(response.status, 503); assert.ok((await response.text()).includes('dependency_unavailable'));
  });
  const base = { event_name: 'page_view', occurred_at: new Date().toISOString(), session_id: 'session_1234567890123456', visitor_id: 'visitor_1234567890123456' };
  for (const [label, patch] of [['trusted paid', { event_name: 'gift_card_paid' }], ['trusted booking', { event_name: 'booking_request_created' }], ['future', { occurred_at: '2099-01-01T00:00:00Z' }]]) await test(`Analytics rejects ${label} before DB writes`, async () => {
    let writes = 0; globalThis.fetch = async () => { writes++; return Response.json(true); };
    assert.equal((await ingest({ request: req({ ...base, ...patch }), env })).status, 204); assert.equal(writes, 0);
  });
  await test('Analytics schema excludes PII synonyms and URL secrets', async () => {
    assert.deepEqual(publicEventMetadata('booking_form_open', { contact_value: 'secret', alternate_email: 'secret', request_type: 'private', arbitrary: 'secret' }), { request_type: 'private' });
    assert.equal(canonicalPublicPath('/reviews?token=secret#access_token=secret'), '/reviews');
  });
  await test('Valid analytics interaction reaches session + event storage', async () => {
    const calls = []; globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return Response.json(true); };
    await ingest({ request: req({ ...base, metadata: { email: 'nope' }, path: '/reviews#secret' }), env });
    assert.equal(calls.length, 3); assert.equal(calls[2].body[0].path, '/reviews'); assert.deepEqual(calls[2].body[0].metadata, {});
  });
  await test('Backup workflow hostile attribution remains literal JSON data', async () => {
    const hostile = '$(touch injected)`touch injected`"\n\\Unicode-火';
    const dir = await mkdtemp(path.join(tmpdir(), 'vulcaniq-backup-fixture-')); await mkdir(path.join(dir, 'backup'));
    execFileSync(process.execPath, [path.resolve('scripts/backup-metadata.mjs')], { cwd: dir, env: { ...process.env, BACKUP_REQUESTED_BY: hostile } });
    assert.equal(JSON.parse(await readFile(path.join(dir, 'backup/00_project_info.json'), 'utf8')).requested_by, hostile);
    await assert.rejects(access(path.join(dir, 'injected')));
  });
  await test('Three partial runs cannot prune last complete recovery point', async () => {
    const rows = [{ id: 1, name: 'vulcaniq-supabase-backup-old-complete', created_at: '2026-01-01' }, ...[2, 3, 4, 5].map((id) => ({ id, name: `vulcaniq-supabase-backup-${id}-partial`, created_at: `2026-01-0${id}` }))];
    const plan = planRetention(rows); assert.equal(plan.completeAvailable, true); assert.ok(plan.remove.every((row) => row.id !== 1)); assert.equal(plan.remove.length, 1);
  });
  await test('Empty healthy Storage complete; partial/corrupt manifests never complete', async () => {
    assert.equal(completeness({}, { exportStatus: 'complete', failureCount: 0, buckets: [], objectCount: 0 }, true).recovery_status, 'database_storage_complete');
    for (const manifest of [{ exportStatus: 'partial', failureCount: 1, buckets: [], objectCount: 0 }, { exportStatus: 'complete', failureCount: 0, buckets: [] }]) assert.equal(completeness({}, manifest, true).recovery_status, 'partial');
    assert.equal(projectInfo({}).system_complete, false);
  });
  await test('Restore refuses all remote and unnamed local DB targets', async () => {
    assert.throws(() => isolatedRestoreTarget('postgres://user:fixture@prod.supabase.co/postgres'));
    assert.throws(() => isolatedRestoreTarget('postgres://user:fixture@127.0.0.1/postgres'));
    assert.ok(isolatedRestoreTarget('postgres://user:fixture@127.0.0.1/vulcaniq_restore_fixture'));
  });
  await test('Artifact streaming >128MB keeps pull count bounded and supports cancel', async () => {
    let produced = 0; let cancelled = false;
    const upstream = new Response(new ReadableStream({ pull(c) { if (produced++ < 140) c.enqueue(new Uint8Array(1024 * 1024)); else c.close(); }, cancel() { cancelled = true; } }));
    const stream = await artifactStream(upstream); assert.ok(produced <= 3);
    const reader = stream.getReader(); let consumed = 0;
    while (true) { const chunk = await reader.read(); if (chunk.done) break; consumed += chunk.value.byteLength; }
    assert.equal(consumed, 140 * 1024 * 1024);
    const second = await artifactStream(new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(1024)); }, cancel() { cancelled = true; } })));
    await second.cancel(); assert.equal(cancelled, true);
  });
  await test('Truncated artifact fails stream rather than silently succeeding', async () => {
    const stream = await artifactStream(new Response(new Uint8Array(5), { headers: { 'content-length': '10' } }));
    await assert.rejects(new Response(stream).arrayBuffer(), /artifact_stream_failed/);
  });
  await test('Email acceptance then DB failure remains unknown and never retries blindly', async () => {
    let state = 'new', sends = 0;
    const dbJson = async (url, init) => { if (url.includes('claim_')) { if (state === 'new') { state = 'claimed'; return { attempt_token: 'fixture' }; } return { status: state }; } if (url.includes('start_')) { state = 'sending'; return true; } throw new Error('database unavailable'); };
    const send = async ({ idempotencyKey }) => { sends++; assert.match(idempotencyKey, /^vulcaniq-[a-f0-9]{64}$/); return 'provider-fixture'; };
    assert.equal((await deliverOperationalEmail({ dbJson, send, key: 'synthetic', input: {} })).status, 'unknown');
    await deliverOperationalEmail({ dbJson, send, key: 'synthetic', input: {} }); assert.equal(sends, 1);
  });
  await test('Stale email claim cannot call provider', async () => {
    let sends = 0;
    const dbJson = async (url) => url.includes('claim_') ? { attempt_token: 'stale' } : false;
    await deliverOperationalEmail({ dbJson, send: async () => { sends++; }, key: 'fixture', input: {} }); assert.equal(sends, 0);
  });
  // Real Edge handler executed under a synthetic Deno environment. No remote requests.
  let googleHandler;
  const edgeEnv = { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SECRET_KEY: env.SUPABASE_SECRET_KEY };
  globalThis.Deno = { env: { get: (name) => edgeEnv[name] }, serve: (handler) => { googleHandler = handler; } };
  let providerMock = async () => { throw new Error('unexpected provider'); };
  globalThis.fetch = (...args) => providerMock(...args);
  await import('../supabase/functions/google-reviews-sync/index.ts');
  for (const scenario of ['unauthenticated', 'expired', 'inactive', 'wrong-role', 'throttled']) await test(`Google ${scenario}: zero state/provider writes`, async () => {
    const writes = [];
    globalThis.fetch = async (url, init = {}) => {
      if (String(url).includes('/auth/v1/user')) return Response.json({ id: 'synthetic-user' }, { status: scenario === 'expired' ? 401 : 200 });
      if (String(url).includes('admin_profiles')) return Response.json(scenario === 'inactive' ? [] : [{ role: scenario === 'wrong-role' ? 'guide' : 'owner', active: true }]);
      if (String(url).includes('claim_admin_action_rate_limit')) return Response.json(false);
      writes.push(url); throw new Error('unexpected write');
    };
    const response = await googleHandler(new Request('https://fixture/functions', { method: 'POST', headers: scenario === 'unauthenticated' ? {} : { authorization: 'Bearer fixture-user-jwt' } }));
    assert.ok([401, 403, 429].includes(response.status)); assert.equal(writes.length, 0);
  });
  for (const mode of ['success', 'provider-failure']) await test(`Authorized Google ${mode} updates legitimate sync state`, async () => {
    Object.assign(edgeEnv, { GOOGLE_REVIEWS_SYNC_SECRET: 'fixture-secret', GOOGLE_BUSINESS_ACCOUNT_ID: '123', GOOGLE_BUSINESS_LOCATION_ID: '456', GOOGLE_BUSINESS_CLIENT_ID: 'fixture', GOOGLE_BUSINESS_CLIENT_SECRET: 'fixture', GOOGLE_BUSINESS_REFRESH_TOKEN: 'fixture' });
    const states = [];
    providerMock = async (url) => String(url).includes('oauth2') ? Response.json(mode === 'success' ? { access_token: 'fixture' } : {}, { status: mode === 'success' ? 200 : 401 }) : Response.json({ reviews: [], totalReviewCount: 0 });
    globalThis.fetch = async (url, init) => { if (String(url).includes('google_reviews_sync_state')) states.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); };
    const response = await googleHandler(new Request('https://fixture/functions', { method: 'POST', headers: { 'x-vulcaniq-google-reviews-sync-secret': 'fixture-secret' } }));
    assert.equal(response.status, mode === 'success' ? 200 : 500); assert.equal(states.at(-1).status, mode === 'success' ? 'connected' : 'error');
  });
  await test('MFA gate checks verified identity, AAL2 and recent actual AMR, never refresh iat', async () => {
    const now = Date.now();
    const token = (claims) => `fixture.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture`;
    const policy = { ADMIN_STEP_UP_ENFORCE: 'true' };
    assert.equal(verifiedAdminStepUp('', 'owner', {}).ok, true);
    assert.equal(verifiedAdminStepUp(token({ sub: 'owner', aal: 'aal1', iat: now / 1000 }), 'owner', policy).ok, false);
    assert.equal(verifiedAdminStepUp(token({ sub: 'owner', aal: 'aal2', amr: [{ method: 'totp', timestamp: (now - 3600000) / 1000 }] }), 'owner', policy).ok, false);
    assert.equal(verifiedAdminStepUp(token({ sub: 'owner', aal: 'aal2', amr: [{ method: 'totp', timestamp: now / 1000 }] }), 'owner', policy).ok, true);
    assert.equal(verifiedAdminStepUp(token({ sub: 'attacker', aal: 'aal2', amr: [{ method: 'totp', timestamp: now / 1000 }] }), 'owner', policy).ok, false);
  });
  await test('Edge backend extra headers cannot replace authentication and Headers objects preserve Prefer', async () => {
    const { supabaseHeaders } = await import('../supabase/functions/_shared/vulcaniq.ts');
    assert.throws(() => supabaseHeaders({ Authorization: 'Bearer attacker' }), /backend_auth_header_override/);
    assert.throws(() => supabaseHeaders(new Headers({ APIKEY: 'attacker' })), /backend_auth_header_override/);
    const headers = new Headers(supabaseHeaders(new Headers({ Prefer: 'return=representation' })));
    assert.equal(headers.get('prefer'), 'return=representation'); assert.notEqual(headers.get('apikey'), 'attacker');
  });
  await test('Synthetic backup verifies checksum and rejects changed bytes', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'vulcaniq-restore-fixture-'));
    await mkdir(path.join(dir, 'storage-assets'));
    const files = { '00_project_info.json': JSON.stringify({ database_complete: true, storage_complete: true, system_complete: false }), 'storage-assets/manifest.json': JSON.stringify({ exportStatus: 'complete', failureCount: 0, buckets: [] }), '01_roles.sql': '-- synthetic roles', '02_schema.sql': '-- synthetic schema', '03_data.sql': '-- synthetic data' };
    for (const [name, value] of Object.entries(files)) await writeFile(path.join(dir, name), value);
    await writeFile(path.join(dir, 'checksums.sha256'), Object.entries(files).map(([name, value]) => `${createHash('sha256').update(value).digest('hex')}  ${name}`).join('\n'));
    assert.equal((await verifyBackup(dir)).checkedFiles, 5);
    await writeFile(path.join(dir, '03_data.sql'), '-- corrupted');
    await assert.rejects(verifyBackup(dir), /checksum_mismatch/);
  });
  for (const [name, coverage, expectedData, expectedSchema, includeMetadata] of [
    ['metadata not requested', null, null, null, false],
    ['legacy hardcoded exclusion is unknown', null, null, null, true],
    ['measured Auth rows preserve UUID recovery', { data_status: 'measured', row_count: 2, schema_status: 'measured', schema_table_count: 0 }, true, false, true],
    ['measured zero rows require separate Auth recovery', { data_status: 'measured', row_count: 0, schema_status: 'measured', schema_table_count: 0 }, false, false, true],
    ['Auth definitions do not prove complete managed recovery', { data_status: 'measured', row_count: 2, schema_status: 'measured', schema_table_count: 2 }, true, true, true],
    ['malformed coverage remains unknown', { data_status: 'measured', row_count: '2', schema_status: 'measured', schema_table_count: -1 }, null, null, true]
  ]) await test(`Backup coverage API and validator: ${name}`, async () => {
    const info = { database_complete: true, storage_complete: true, system_complete: true,
      includes_auth_schema: false, includes_auth_data: false, auth_restore_mode: 'manual_reprovision',
      private_payload: 'synthetic-sensitive-metadata-do-not-expose',
      ...(name.startsWith('legacy') ? { excluded_recovery_scopes: ['auth_identities', 'd1', 'secrets'] } : {}),
      ...(coverage ? { dump_coverage: { method: 'pg_dump_sql_v1', auth: coverage } } : {}) };
    const zip = metadataZip(info);
    let zipReads = 0;
    globalThis.fetch = async url => {
      const pathname = new URL(url).pathname;
      if (pathname === '/auth/v1/user') return Response.json({ id: '22222222-2222-4222-8222-222222222222' });
      if (pathname === '/rest/v1/admin_profiles') return Response.json([{ active: true, role: 'owner' }]);
      if (pathname.endsWith('/zip')) { zipReads++; return new Response(zip); }
      if (pathname.endsWith('/artifacts')) return Response.json({ artifacts: [{ id: 42, name: 'vulcaniq-supabase-backup-2026-11-04_10-00-UTC', size_in_bytes: zip.length, expired: false, created_at: '2026-11-04T10:00:00Z' }] });
      if (pathname.endsWith('/runs')) return Response.json({ workflow_runs: [{ id: 7, status: 'completed', conclusion: 'success' }] });
      throw new Error(`Unexpected synthetic request: ${pathname}`);
    };
    const response = await backupStatus({ request: new Request(`https://fixture.invalid/api/admin/backup/status${includeMetadata ? '?metadata=1' : ''}`, { headers: { Authorization: 'Bearer synthetic-user' } }),
      env: { ...env, SUPABASE_ANON_KEY: 'synthetic-public-key', GITHUB_OWNER: 'synthetic', GITHUB_REPO: 'fixture', GITHUB_BACKUP_TOKEN: 'synthetic-github-token' } });
    assert.equal(response.status, 200);
    const body = await response.json();
    const expectedAuth = { schemaIncluded: expectedSchema, dataIncluded: expectedData,
      restoreMode: expectedData === true ? 'preserve_uuid_with_compatible_managed_schema' : expectedData === false ? 'separate_auth_recovery_required' : 'verify_dump_coverage', restoreComplete: false };
    assert.deepEqual(body.latestBackup.auth, expectedAuth);
    assert.equal(body.latestBackup.systemComplete, false);
    assert.equal(zipReads, includeMetadata ? 1 : 0);
    assert.equal(JSON.stringify(body).includes(info.private_payload), false);
    assert.equal(body.latestBackup.projectInfo, undefined);
    if (!includeMetadata) return;
    const directory = await mkdtemp(path.join(tmpdir(), 'vulcaniq-auth-coverage-fixture-'));
    await mkdir(path.join(directory, 'storage-assets'));
    const files = { '00_project_info.json': JSON.stringify(info), 'storage-assets/manifest.json': JSON.stringify({ exportStatus: 'complete', failureCount: 0, buckets: [] }), '01_roles.sql': '-- synthetic', '02_schema.sql': '-- synthetic', '03_data.sql': '-- synthetic' };
    for (const [file, data] of Object.entries(files)) await writeFile(path.join(directory, file), data);
    await writeFile(path.join(directory, 'checksums.sha256'), Object.entries(files).map(([file, data]) => `${createHash('sha256').update(data).digest('hex')}  ${file}`).join('\n'));
    const report = await verifyBackup(directory);
    assert.deepEqual(report.auth, expectedAuth);
    assert.equal(report.systemComplete, false);
    assert.deepEqual(report.excludedScopes, ['managed_auth_runtime', 'd1', 'secrets']);
  });
  await test('Admin handoff stores retry after provider failure and accepts only explicit receipt', async () => {
    const finishes = [];
    const dbJson = async (url, init) => url.includes('claim_') ? [{ dedupe_key: 'request:synthetic', attempt_token: 'fixture', category: 'new_bookings', destination: '/admin/requests' }] : url.includes('validate_') ? true : (finishes.push(JSON.parse(init.body)), true);
    const config = { dbJson, endpoint: 'https://synthetic.invalid/api/ingest', secret: 'fixture' };
    await drainAdminNotificationHandoffs({ ...config, fetchImpl: async () => { throw new Error('network timeout'); } });
    assert.equal(finishes[0].p_accepted, false);
    await drainAdminNotificationHandoffs({ ...config, fetchImpl: async () => Response.json({ ok: true }) });
    assert.equal(finishes[1].p_accepted, true);
    assert.equal(finishes[0].p_key, finishes[1].p_key);
    assert.equal(finishes[1].p_attempt, 'fixture');
  });
  await test('Compatibility fallback rejects permission/network errors even naming columns', async () => {
    assert.equal(isMissingColumn({ code: '42501', message: 'source denied' }, ['source']), false);
    assert.equal(isMissingColumn({ code: '42703', message: 'source missing' }, ['source']), true);
    assert.equal(isMissingFunction({ code: '42501', message: 'get_public_google_reviews permission denied' }, ['get_public_google_reviews']), false);
    assert.equal(isMissingFunction({ code: 'PGRST202', message: 'get_public_google_reviews missing' }, ['get_public_google_reviews']), true);
  });
  const availabilitySource = (await readFile('src/services/availabilityService.js', 'utf8'))
    .replace("import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';", 'const isSupabaseConfigured = true; const supabase = globalThis.__availabilityFixture;')
    .replace("'../data/availability.js'", JSON.stringify(pathToFileURL(path.resolve('src/data/availability.js')).href))
    .replace("'./schemaCompatibility.js'", JSON.stringify(pathToFileURL(path.resolve('src/services/schemaCompatibility.js')).href));
  for (const [label, code, callsExpected, rejects] of [['permission', '42501', 1, true], ['network', 'NETWORK', 1, true], ['known missing column', '42703', 2, false], ['genuine empty', '', 1, false]]) await test(`Availability ${label} behavior`, async () => {
    let calls = 0;
    const builder = { select() { return this; }, eq() { return this; }, gte() { return this; }, order() { return this; }, then(resolve) { calls++; return Promise.resolve({ data: [], error: calls === 1 && code ? { code, message: 'program_it unavailable' } : null }).then(resolve); } };
    globalThis.__availabilityFixture = { from: () => builder };
    const service = await import(`data:text/javascript;base64,${Buffer.from(availabilitySource + `\n// ${label}`).toString('base64')}`);
    if (rejects) await assert.rejects(service.loadPublicFixedExcursions(), /unavailable/); else assert.deepEqual(await service.loadPublicFixedExcursions(), []);
    assert.equal(calls, callsExpected);
  });
  delete globalThis.__availabilityFixture;
  await test('Challenge loader shares one script and permits retry after bounded load failure', async () => {
    const scripts = [];
    const window = {};
    const document = { createElement: () => ({ remove() { this.removed = true; } }), head: { appendChild(script) { scripts.push(script); } } };
    const first = loadPublicChallenge({ window, document, timeoutMs: 5 });
    assert.equal(loadPublicChallenge({ window, document }), first);
    await assert.rejects(first, /challenge_unavailable/);
    assert.equal(scripts[0].removed, true);
    const retried = loadPublicChallenge({ window, document, timeoutMs: 100 });
    window.turnstile = { render() {} };
    scripts[1].onload();
    assert.equal(await retried, window.turnstile);
    assert.equal(scripts.length, 2);
  });
  await test('Challenge callback invalidates expired/error tokens and ignores late unmounted callback', async () => {
    let options; const changes = []; let removed;
    const api = { render(_, value) { options = value; return 'widget-id'; }, remove(id) { removed = id; } };
    const remove = mountPublicChallenge(api, {}, { siteKey: 'public-fixture', language: 'en', onChange: (...value) => changes.push(value) });
    assert.equal(options.action, 'public_submission'); assert.equal(options.size, 'compact'); assert.equal(options.tabindex, 0);
    options.callback('opaque-token'); options['expired-callback'](); options['error-callback']();
    assert.deepEqual(changes, [['opaque-token', 'complete'], ['', 'expired'], ['', 'error']]);
    remove(); options.callback('late-token'); assert.equal(changes.length, 3); assert.equal(removed, 'widget-id');
  });
  for (const size of [0, 1001, 5001]) await test(`Weekly recap ${size} rows survives server's lower page cap`, async () => {
    const rows = Array.from({ length: size }, (_, i) => ({ id: String(i).padStart(8, '0') }));
    const query = async (url) => { const after = new URL(url, 'https://fixture').searchParams.get('id')?.slice(3) || ''; return rows.filter((row) => row.id > after).slice(0, 100); };
    assert.equal((await completeRows(query, 'reviews', { select: 'id' })).length, size);
  });
  await test('Weekly recap errors/ceiling fail explicitly instead of returning partial counts', async () => {
    let calls = 0;
    await assert.rejects(completeRows(async () => { if (++calls === 1) return [{ id: 'one' }]; throw Error('source_failed'); }, 'reviews', {}), /source_failed/);
    await assert.rejects(completeRows(async () => [{ id: 'one' }, { id: 'two' }], 'reviews', {}, { maximum: 1 }), /recap_source_limit/);
    await assert.rejects(completeRows(async () => [{ id: 'one' }], 'reviews', {}), /recap_cursor_invalid/);
  });
  await test('Retention defaults read-only, preserves linked business context, and bounds deletion', async () => {
    const preview = retentionSql(365); assert.match(preview, /begin read only/); assert.doesNotMatch(preview, /delete/i);
    const apply = retentionSql(365, { apply: true, batch: 100 });
    assert.match(apply, /not exists\(select 1 from public.booking_requests/); assert.match(apply, /not exists\(select 1 from public.gift_card_requests/);
    assert.match(apply, /limit 100 for update skip locked/); assert.doesNotMatch(apply, /delete from public\.(?:booking_requests|gift_card_requests)/);
    assert.throws(() => retentionSql(1), /invalid_retention_bounds/); assert.throws(() => retentionSql(30, { batch: 1001 }), /invalid_retention_bounds/);
  });
  await test('Referral exclusion keeps explicit code only in memory and clears optional persistent attribution', async () => {
    const originalWindow = globalThis.window;
    let allowed = false; const values = new Map(); const listeners = {};
    globalThis.__referralConsent = () => allowed;
    globalThis.window = { localStorage: { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }, addEventListener: (event, action) => { listeners[event] = action; } };
    try {
      const source = (await readFile('src/services/referrals.js', 'utf8'))
        .replace("import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';", 'const isSupabaseConfigured = false; const supabase = {};')
        .replace("import { canTrack } from '../analytics.js';", 'const canTrack = () => globalThis.__referralConsent();')
        .replace("import { PRIVACY_PREFERENCES_EVENT } from './privacyPreferences.js';", "const PRIVACY_PREFERENCES_EVENT = 'privacy';");
      const service = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
      service.storeReferralJourney('REF-FIXTURE-ABCD'); assert.equal(values.size, 0);
      assert.deepEqual(service.referralAttributionPayload(), { referral_code: 'REF-FIXTURE-ABCD', referral_source: 'customer_referral' });
      allowed = true; service.storeReferralJourney('REF-FIXTURE-ABCD'); assert.equal(values.size, 1);
      allowed = false; listeners.privacy(); assert.equal(values.size, 0); assert.equal(service.referralAttributionPayload().utm_source, undefined);
    } finally { globalThis.window = originalWindow; delete globalThis.__referralConsent; }
  });
  await test('Actual Storage restore script verifies bytes and preserves private bucket in isolated provider mock', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'vulcaniq-storage-restore-fixture-'));
    await mkdir(path.join(dir, 'storage-assets', 'private-fixture'), { recursive: true });
    const files = {
      '00_project_info.json': JSON.stringify({ database_complete: true, storage_complete: true, system_complete: false }),
      '01_roles.sql': '-- synthetic roles', '02_schema.sql': '-- synthetic schema', '03_data.sql': '-- synthetic data',
      'storage-assets/private-fixture/evidence.txt': 'Synthetic confidential fixture bytes',
      'storage-assets/manifest.json': JSON.stringify({ exportStatus: 'complete', failureCount: 0, buckets: [{ name: 'private-fixture', public: false, objects: [{ bucket: 'private-fixture', name: 'evidence.txt', path: 'storage-assets/private-fixture/evidence.txt', contentType: 'text/plain' }] }] })
    };
    for (const [name, data] of Object.entries(files)) await writeFile(path.join(dir, name), data);
    await writeFile(path.join(dir, 'checksums.sha256'), Object.entries(files).map(([name, data]) => `${createHash('sha256').update(data).digest('hex')}  ${name}`).join('\n'));
    await writeFile(path.join(dir, 'restore-storage.cjs'), await readFile('scripts/restore-storage.js'));
    await writeFile(path.join(dir, 'validate-backup.mjs'), await readFile('scripts/validate-backup.mjs'));
    const mock = `const assert = require('node:assert/strict'); let calls=0;
      globalThis.fetch=async(url,init={})=>{calls++; assert.equal(new URL(url).hostname,'127.0.0.1');
        if(!init.method)return new Response(null,{status:404});
        if(url.endsWith('/bucket')){assert.equal(JSON.parse(init.body).public,false);return Response.json({});}
        let content='';for await(const part of init.body)content+=part.toString();
        assert.equal(content,'Synthetic confidential fixture bytes'); assert.match(url,/private-fixture\\/evidence.txt$/);
        return Response.json({});}; process.on('exit',()=>{if(process.exitCode!==1){assert.equal(calls,3);console.log('RESTORE_MOCK_VERIFIED');}else assert.equal(calls,0);});`;
    await writeFile(path.join(dir, 'provider-mock.cjs'), mock);
    const args = ['--require', path.join(dir, 'provider-mock.cjs'), path.join(dir, 'restore-storage.cjs')];
    const options = { cwd: dir, encoding: 'utf8', env: { ...process.env, SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SECRET_KEY: 'sb_secret_synthetic', SUPABASE_SERVICE_ROLE_KEY: '', RESTORE_ISOLATED: 'true' } };
    assert.match(execFileSync(process.execPath, args, options), /RESTORE_MOCK_VERIFIED/);
    await writeFile(path.join(dir, 'storage-assets/private-fixture/evidence.txt'), 'tampered');
    assert.throws(() => execFileSync(process.execPath, args, { ...options, stdio: 'pipe' }), /backup_checksum_mismatch/);
  });
  await test('Static and Function report-only CSP permit only the named challenge origin in required directives', async () => {
    const staticHeaders = await readFile('public/_headers', 'utf8');
    const dynamic = (await middleware({ request: req({}), next: async () => new Response('safe') })).headers;
    for (const policy of [staticHeaders.match(/Content-Security-Policy-Report-Only: ([^\r\n]+)/)[1], dynamic.get('Content-Security-Policy-Report-Only')]) {
      for (const directive of ['script-src', 'connect-src', 'frame-src']) {
        const value = policy.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${directive} `));
        assert.ok(value.split(' ').includes('https://challenges.cloudflare.com'));
      }
    }
    assert.equal(dynamic.has('Content-Security-Policy'), false);
  });
  await test('Referral HTTP and malformed failures remain retryable instead of becoming invalid links', async () => {
    const source = (await readFile('src/services/referrals.js', 'utf8'))
      .replace("import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';", 'const isSupabaseConfigured = true; const supabase = {};')
      .replace("import { canTrack } from '../analytics.js';", 'const canTrack = () => false;')
      .replace("import { PRIVACY_PREFERENCES_EVENT } from './privacyPreferences.js';", "const PRIVACY_PREFERENCES_EVENT = 'privacy';");
    const service = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    for (const [status, code] of [[429, 'REFERRAL_RATE_LIMITED'], [503, 'REFERRAL_UNAVAILABLE'], [403, 'REFERRAL_CHALLENGE_REQUIRED'], [200, 'REFERRAL_UNAVAILABLE']]) {
      globalThis.fetch = async () => Response.json({}, { status, headers: { 'Retry-After': '60' } });
      await assert.rejects(service.validateAndRecordReferralClick('REF-FIXTURE-ABCD', { turnstile_token: 'synthetic' }), (error) => error.code === code && error.retryable === true && error.retryAfter === 60);
    }
    globalThis.fetch = async () => { throw new Error('private upstream detail'); };
    await assert.rejects(service.validateAndRecordReferralClick('REF-FIXTURE-ABCD'), (error) => error.code === 'REFERRAL_UNAVAILABLE' && error.message === 'REFERRAL_UNAVAILABLE' && error.status === 0 && error.retryable === true);
    globalThis.fetch = async () => Response.json({ valid: false, code: 'REF-FIXTURE-ABCD' });
    assert.equal((await service.validateAndRecordReferralClick('REF-FIXTURE-ABCD')).valid, false);
    globalThis.fetch = async (_, init) => { assert.equal(JSON.parse(init.body).turnstile_token, 'synthetic'); return Response.json({ valid: true, code: 'REF-FIXTURE-ABCD' }); };
    assert.equal((await service.validateAndRecordReferralClick('REF-FIXTURE-ABCD', { turnstile_token: 'synthetic' })).valid, true);
  });
  console.log(`\n${passed} passed, 0 failed.`);
} finally { globalThis.fetch = originalFetch; }

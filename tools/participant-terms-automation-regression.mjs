import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  participantTermsReminderDay,
  participantTermsReminderDecision,
  participantTermsReminderDedupeKey
} from '../workers/notifications/src/index.js';

const read = (file) => fs.readFileSync(file, 'utf8');
const migration = read('supabase/migrations/20260906100000_participant_terms_reminder_state.sql');
const worker = read('workers/notifications/src/index.js');
const api = read('functions/api/notifications/[[path]].js');
const publicAcceptanceApi = read('functions/api/public/terms-acceptance/[[path]].js');
const ui = read('src/features/notifications/NotificationsPage.jsx');
const config = read('workers/notifications/wrangler.toml');
const d1Files = [
  '0001_notifications.sql',
  '0002_campaign_lifecycle.sql',
  '0003_admin_automation_jobs.sql',
  '0004_customer_notification_ownership.sql',
  '0005_customer_notification_operations.sql',
  '0006_participant_ownership_locator.sql',
  '0007_participant_terms_reminders.sql'
];
const d1Phase4 = read(`workers/notifications/migrations/${d1Files.at(-1)}`);
const phase3 = read('supabase/migrations/20260905120000_participant_terms_acceptance_journeys.sql')
  + read('supabase/migrations/20260905130000_participant_terms_email_delivery_hardening.sql');
const adminRelease = read('docs/releases/2026-09-participant-terms-phase4.md');
const adminUat = read('docs/releases/2026-09-participant-terms-admin-uat.md');
const engineeringRelease = read('docs/releases/2026-09-participant-terms-phase4-engineering.md');
const tests = [];
const test = (name, run) => tests.push([name, run]);
const has = (source, ...tokens) => tokens.forEach((token) => assert.ok(source.includes(token), `missing ${token}`));
const lacks = (source, ...tokens) => tokens.forEach((token) => assert.ok(!source.includes(token), `unexpected ${token}`));

test('Phase 4 uses a new forward Supabase migration', () => {
  assert.ok(fs.existsSync('supabase/migrations/20260906100000_participant_terms_reminder_state.sql'));
  has(migration, 'get_participant_terms_reminder_states', 'security definer');
});
test('authoritative resolver is bounded to 100 owned booking IDs', () => has(migration, 'cardinality(p_booking_request_ids) > 100', 'participant_terms_reminder_batch_invalid'));
test('resolver is service-role-only', () => has(migration, 'from public, anon, authenticated, service_role', 'to service_role'));
test('resolver is read-only and never mutates Terms evidence', () => lacks(migration, 'insert into public.terms_', 'update public.terms_', 'delete from public.terms_'));
test('current Terms resolution is purpose locale publication and time scoped', () => has(migration, "version.document_purpose = 'excursion_booking'", 'version.locale = p_locale', "version.status = 'published'", 'version.effective_at <= evaluated_at', 'version.published_at <= evaluated_at'));
test('accepted active booking with known composition and outstanding evidence is eligible', () => {
  const result = participantTermsReminderDecision({ reminder_required: true, state_changed_at: '2026-09-04T00:00:00Z', suppression_reason: 'outstanding' }, 1440, new Date('2026-09-06T00:00:00Z'));
  assert.equal(result.eligible, true);
});
for (const [name, reason] of [['complete booking','complete'],['cancelled booking','booking_closed'],['archived booking','booking_closed'],['no Terms version','terms_unavailable'],['incomplete composition','composition_incomplete']]) {
  test(`${name} is not eligible`, () => assert.deepEqual(participantTermsReminderDecision({ reminder_required: false, suppression_reason: reason }, 1440), { eligible: false, reason }));
}
test('first reminder observes the configured initial delay', () => {
  const result = participantTermsReminderDecision({ reminder_required: true, state_changed_at: '2026-09-06T10:00:00Z' }, 1440, new Date('2026-09-06T12:00:00Z'));
  assert.equal(result.eligible, false); assert.equal(result.reason, 'initial_delay');
});
test('booking state timing participates in the authoritative revision', () => has(migration, 'coalesce(booking.updated_at', 'evaluated.changed_at::text'));
test('calendar window is deterministic in Europe Rome', () => assert.equal(participantTermsReminderDay(new Date('2026-09-06T22:30:00Z')), '2026-09-07'));
test('dedupe key binds booking reference and calendar day', () => {
  assert.equal(participantTermsReminderDedupeKey('a'.repeat(64), '2026-09-06'), `participant-terms:${'a'.repeat(64)}:2026-09-06`);
});
test('D1 migrations apply in order with the Phase 4 rule and scan index', () => {
  const database = new DatabaseSync(':memory:');
  for (const file of d1Files) database.exec(read(`workers/notifications/migrations/${file}`));
  assert.equal(database.prepare("select count(*) count from notification_automation_rules where rule_key='customer_participant_terms_reminder' and offset_minutes=1440").get().count, 1);
  assert.ok(database.prepare("select name from pragma_table_info('notification_subscription_ownership') where name='terms_reminder_checked_at'").get());
  assert.ok(database.prepare("select name from sqlite_master where type='index' and name='notification_ownership_terms_scan_idx'").get());
  database.close();
});
test('same scheduler window and retry produce one job while the next day is allowed', () => {
  const database = new DatabaseSync(':memory:');
  for (const file of d1Files) database.exec(read(`workers/notifications/migrations/${file}`));
  const at = '2026-09-06T10:00:00Z'; const ref = 'e'.repeat(64); const token = 'a'.repeat(64); const entity = '41000000-0000-4000-8000-000000000001';
  database.prepare("insert into notification_subscriptions(id,audience,app_variant,device_id,device_token_hash,endpoint,enabled,created_at,updated_at,last_seen_at) values('s','public','public','d',?,'inapp://public/s',1,?,?,?)").run(token, at, at, at);
  database.prepare("insert into notification_preferences(subscription_id,resolved_locale,categories_json,updated_at) values('s','en','[]',?)").run(at);
  database.prepare("insert into notification_ownership_claims(id,token_hash,entity_type,entity_ref,journey_type,status,claimed_subscription_id,expires_at,claimed_at,created_at,entity_id) values('c',?,'booking_request',?,'booking','claimed','s','2099-01-01T00:00:00Z',?,?,?)").run(token, ref, at, at, entity);
  database.prepare("insert into notification_subscription_ownership(id,claim_id,subscription_id,entity_type,entity_ref,journey_type,verified_at,created_at,entity_id) values('o','c','s','booking_request',?,'booking',?,?,?)").run(ref, at, at, entity);
  const insert = (id, day) => database.prepare("insert or ignore into notification_jobs(id,rule_key,source_type,source_id,source_revision,recipient_subscription_id,audience,category,title_it,body_it,title_en,body_en,scheduled_for,dedupe_key,created_at,ownership_id) values(?,'customer_participant_terms_reminder','participant_terms_reminder',?,'r','s','public','customer_participant_terms_reminder','t','b','t','b',?,?,?,'o')").run(id, ref, at, participantTermsReminderDedupeKey(ref, day), at);
  insert('j1', '2026-09-06'); insert('j2', '2026-09-06'); insert('j3', '2026-09-07');
  assert.equal(database.prepare("select count(*) count from notification_jobs where source_type='participant_terms_reminder'").get().count, 2);
  database.close();
});
test('scheduler selects only active owned recipients with reminders enabled', () => has(worker, "o.revoked_at IS NULL", 'o.reminders_enabled=1', "s.audience='public'", 's.enabled=1'));
test('scheduler batches fairly using a non-PII scan watermark', () => has(worker, "ORDER BY coalesce(o.terms_reminder_checked_at,''),o.id LIMIT ?", 'PARTICIPANT_TERMS_RECONCILE_BATCH_CAP'));
test('scheduler calls the authoritative resolver rather than duplicating evidence rules', () => has(worker, '/rpc/get_participant_terms_reminder_states', 'participantTermsReminderStates'));
test('scheduled reminders are revalidated immediately before delivery', () => has(worker, "job.category==='customer_participant_terms_reminder'", 'state?.reminder_required!==true', 'state.state_revision!==job.source_revision'));
test('completion or state changes cancel queued reminders', () => has(worker + api, "source_type='participant_terms_reminder'", "status='cancelled'", 'terms_state_changed'));
test('owned evidence writes do not become false failures when best-effort D1 cleanup is unavailable', () => {
  const cleanup = api.slice(api.indexOf('async function cancelParticipantTermsReminderJobs'), api.indexOf('function customerPreferenceColumn'));
  has(cleanup, 'try {', 'catch {', 'return 0;', 'Worker revalidates');
});
test('public participant acceptance best-effort cancels queued reminders without exposing booking IDs', () => {
  has(publicAcceptanceApi, 'cancelCompletedTermsReminder(env, tokenHash)', "source_type='participant_terms_reminder'", "failure_reason='terms_state_changed'");
  const responseStart = publicAcceptanceApi.indexOf('await cancelCompletedTermsReminder(env, tokenHash);');
  const responseEnd = publicAcceptanceApi.indexOf('  } catch', responseStart);
  assert.ok(responseStart >= 0 && responseEnd > responseStart, 'accepted response block must remain inspectable');
  lacks(publicAcceptanceApi.slice(responseStart, responseEnd), 'booking_request_id');
});
test('booking cancellation cancels Terms reminders while evidence remains untouched', () => {
  has(api, "eventType==='booking_cancelled'", "failure_reason='booking_closed'"); lacks(api, 'delete from terms_acceptances');
});
test('ownership revocation cancels every scheduled owned job', () => has(api, "failure_reason='ownership_revoked'", "ownership_id=? AND status='scheduled'"));
test('disabling owned reminders cancels only scheduled Terms reminder work', () => has(api, "terms_reminders_disabled", "source_type='participant_terms_reminder'"));
test('pending expired and revoked invitations remain incomplete', () => {
  const resolver = migration.slice(migration.indexOf('create or replace function'));
  lacks(resolver, 'terms_acceptance_invitations'); has(resolver, 'terms_acceptances');
});
test('consumed invitation requires acceptance evidence to count complete', () => has(phase3, 'consumed_terms_acceptance_id', 'terms_acceptances'));
test('minor self-acceptance remains impossible and guardian evidence remains explicit', () => has(phase3, "representation_type = 'parent_or_guardian'", "representation_type = 'self'", 'guardian_participant_id'));
test('reminder copy is generic and contains no participant PII', () => {
  has(worker, 'Action required for your booking', 'Some participant details or Terms confirmations are still incomplete.');
  lacks(worker.slice(worker.indexOf('async function reconcileParticipantTermsReminders'), worker.indexOf('async function deliver(')), 'full_name', 'customer_email', 'customer_phone');
});
test('reminders never issue invitation tokens or send participant email', () => lacks(worker, 'issue_participant_terms_acceptance_invitation', 'rawToken', 'RESEND_API_KEY'));
test('organizer response and UI still contain no copyable bearer link', () => lacks(api + ui, 'issuedLink', 'Copy acceptance link', 'participantTermsAcceptanceUrl'));
test('owned UI reports last reminder lifecycle without exposing internal failure text', () => has(ui, 'reminderLifecycleLabel', 'Last Terms reminder sent', 'Terms reminder delivery failed'));
test('Admin job observability includes category status time and failure state', () => has(ui, '{job.category} · {job.status}', 'job.failure_reason', 'job.scheduled_for'));
test('Cron remains disabled in Production and Preview', () => assert.equal((config.match(/crons\s*=\s*\[\]/g) || []).length, 2));
test('Phase 4 D1 migration contains no token destination or participant PII', () => lacks(d1Phase4, 'token', 'email', 'phone', 'participant_name'));
test('Admin release note explains exact lifecycle labels and forbidden actions', () => has(adminRelease, 'Invitation sent · Pending', 'Invitation expired', 'Invitation revoked', 'Parent/guardian acceptance required', 'Do not accept Terms for an unrelated adult'));
test('Admin UAT covers participants adults minors guardians reminders cancellation disconnect and mobile', () => has(adminUat, 'Additional adult invitation', 'Minor — organizer guardian', 'Reminder automation', 'Disconnect Personal updates', 'Mobile and accessibility', 'Bug report template'));
test('engineering notes preserve evidence and require forward fixes', () => has(engineeringRelease, 'Do not drop the resolver during an incident', 'do not delete acceptance evidence', 'new forward migration'));
test('release documentation keeps Cron off and discloses the shared Production Supabase backend', () => has(adminRelease + adminUat + engineeringRelease, 'Production Cron is **OFF**', 'shared Production Supabase', 'Cron remains off'));

let passed = 0; const failures = [];
for (const [name, run] of tests) {
  try { await run(); passed += 1; console.log(`PASS  ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL  ${name}: ${error.message}`); }
}
console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length) process.exit(1);

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { firstRunStep } from '../src/services/firstRunOnboarding.js';
import { readInitialPublicLanguage, storePublicLanguage, suggestedPublicLanguage } from '../src/services/languagePreference.js';

const read = (file) => fs.readFileSync(file, 'utf8');
const main = read('src/main.jsx');
const css = read('src/styles.css');
const onboarding = read('src/features/onboarding/FirstRunOnboarding.jsx');
const notificationUi = read('src/features/notifications/NotificationsPage.jsx');
const notificationCss = read('src/features/notifications/notifications.css');
const notificationApi = read('functions/api/notifications/[[path]].js');
const notificationService = read('src/services/notificationService.js');
const ownershipHelper = read('functions/api/notifications/_ownership.js');
const participantMigration = read('supabase/migrations/20260905100000_booking_participants_foundation.sql');
const locatorMigration = read('workers/notifications/migrations/0006_participant_ownership_locator.sql');
const bookingService = read('src/services/bookingRequests.js');
const termsDoc = read('docs/PWA_PRIVACY_TERMS_ARCHITECTURE_20260905.md');
const tests = [];
function test(name, run) { tests.push([name, run]); }
function contains(source, values) { for (const value of values) assert.ok(source.includes(value), `missing ${value}`); }

test('device locale recommends Italian only for it locales', () => {
  assert.equal(suggestedPublicLanguage('it-CH'), 'it');
  assert.equal(suggestedPublicLanguage('en-GB'), 'en');
  assert.equal(suggestedPublicLanguage('de-CH'), 'en');
});

test('explicit language persists in the existing public language key', () => {
  const values = new Map();
  globalThis.window = { location: { search: '' }, localStorage: { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) } };
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'it-IT' }, configurable: true });
  assert.equal(readInitialPublicLanguage(), 'it');
  storePublicLanguage('en');
  assert.equal(values.get('vulcaniq_public_language'), 'en');
  assert.equal(readInitialPublicLanguage(), 'en');
  delete globalThis.window; delete globalThis.navigator;
});

test('first unresolved onboarding step is deterministic', () => {
  assert.equal(firstRunStep({ languageExplicit: false, privacyResolved: false, notificationDue: true }), 'language');
  assert.equal(firstRunStep({ languageExplicit: true, privacyResolved: false, notificationDue: true }), 'privacy');
  assert.equal(firstRunStep({ languageExplicit: true, privacyResolved: true, notificationDue: true }), 'notifications');
  assert.equal(firstRunStep({ languageExplicit: true, privacyResolved: true, notificationDue: false }), '');
});

test('one dialog sequences independent language, privacy and notification decisions', () => {
  contains(onboarding, ["setStep('privacy')", "setStep('notifications')", 'onLanguage(value)', 'onPrivacy({ analytics: value })', 'completeFirstRunOnboarding()']);
  assert.equal((onboarding.match(/createPortal\(/g) || []).length, 1);
  assert.ok(onboarding.indexOf("{step === 'language' &&") < onboarding.indexOf("{step === 'privacy' &&") && onboarding.indexOf("{step === 'privacy' &&") < onboarding.indexOf("{step === 'notifications' &&"));
});

test('analytics acceptance action spans the complete choice row', () => {
  contains(onboarding, ['first-run-analytics-accept', 'Accept analytics']);
  assert.ok(css.includes('.first-run-actions .first-run-analytics-accept { grid-column: 1 / -1; }'));
});

test('analytics and notification choices are not coupled', () => {
  const privacyBlock = onboarding.slice(onboarding.indexOf('function choosePrivacy'), onboarding.indexOf('function finishNotifications'));
  const notificationBlock = onboarding.slice(onboarding.indexOf('async function enable()'), onboarding.indexOf("if (!step || typeof document"));
  assert.ok(!privacyBlock.includes('enableNotifications'));
  assert.ok(!notificationBlock.includes('onPrivacy('));
  contains(onboarding, ['choosePrivacy(false)', 'finishNotifications']);
});

test('installation and push permission remain explicit user gestures', () => {
  contains(onboarding, ['onClick={enable}', 'onClick={install}', 'await promptInstall()', "platform === 'needs_ios_home_screen'", 'Continua senza notifiche']);
  assert.ok(!onboarding.includes('Notification.requestPermission'));
  assert.ok(notificationService.indexOf('await prompt.prompt()') > notificationService.indexOf('export async function promptInstall'));
});

test('completed/deferred users retain the 30-day no-nag contract', () => {
  contains(onboarding, ['readFirstRunCompletion()', 'readPublicNotificationOnboarding()', 'choice.nextPromptAt <= Number(now)', 'returningNotificationPrompt ? 1400 : 0']);
  assert.ok(notificationService.includes('30 * 24 * 60 * 60 * 1000'));
});

test('Hero rendering remains independent of onboarding initialization', () => {
  const appReturn = main.slice(main.lastIndexOf('return ('), main.lastIndexOf('createRoot('));
  assert.ok(appReturn.indexOf('<Header') < appReturn.indexOf('<FirstRunOnboarding'));
  assert.ok(main.includes('readCachedPublicHeroMedia()') && main.includes('writeCachedPublicHeroMedia(nextMedia)'));
});

test('Fast Request badge is absent and method actions are full width', () => {
  const fast = main.slice(main.indexOf('function FastRequestModal'), main.indexOf('function Hero'));
  assert.ok(!/Richiesta rapida|Fast request/.test(fast));
  assert.ok(!/fast-request-method-header|fast-request-method-back/.test(fast + css));
  const actions = fast.slice(fast.lastIndexOf('<div className="fast-request-delivery-actions"'));
  assert.ok(actions.indexOf('setStep(4)') < actions.indexOf("setDeliveryChoice('website')"));
  assert.ok(css.includes('grid-template-columns: minmax(0, 1fr)'));
});

test('Fast Request routing, attribution and website-only opt-in remain intact', () => {
  const fast = main.slice(main.indexOf('function FastRequestModal'), main.indexOf('function Hero'));
  contains(fast, ['completeStep(5)', 'href={whatsappUrl}', 'submitDirectRequest', 'fastRequestFollowUpdates', 'notification_ownership_requested: followBookingUpdates']);
  assert.ok(fast.indexOf("deliveryChoice === 'website'") < fast.indexOf('fastRequestFollowUpdates'));
});

test('participant schema references canonical booking requests without historical backfill', () => {
  contains(participantMigration, ['booking_request_id uuid not null references public.booking_requests(id) on delete restrict', "booking_status <> 'accepted'", 'participant_booking_not_confirmed']);
  assert.ok(!/insert\s+into\s+public\.booking_participants[\s\S]*select\s+.*from\s+public\.booking_requests/i.test(participantMigration));
});

test('participant type, organizer and lifecycle invariants are constrained', () => {
  contains(participantMigration, ["participant_type in ('adult', 'minor')", "status in ('active', 'removed')", 'booking_participants_one_active_organizer_idx', "participant_type = 'adult'", 'participant_booking_immutable']);
  assert.ok(!participantMigration.includes('create_confirmed_booking_organizer'), 'foundation migration changes accepted-booking behavior automatically');
  assert.ok(!participantMigration.includes('booking_requests_create_confirmed_organizer'), 'foundation migration installs an automatic organizer trigger');
});

test('guardian must be an active adult in the same booking', () => {
  contains(participantMigration, ['guardian_row.booking_request_id <> new.booking_request_id', "guardian_row.participant_type <> 'adult'", "guardian_row.status <> 'active'", 'participant_guardian_in_use']);
});

test('aggregate counts remain unchanged and mismatches are surfaced', () => {
  contains(notificationApi, ['expectedAdults', 'expectedChildren', 'actualAdults', 'actualChildren', 'matches: organizerPresent']);
  contains(notificationUi, ['The entered details do not yet match the booking composition. Booking totals were not changed.', 'Participant details have not been collected.']);
  assert.ok(!/updateOwnedBookingParticipant[\s\S]{0,300}\b(adults|children)\b/.test(notificationUi));
});

test('anonymous relation access is denied and Admin access is view-only', () => {
  contains(participantMigration, ['enable row level security', 'to authenticated\nusing (public.is_admin());', 'revoke all privileges on table public.booking_participants from public, anon, authenticated, service_role;', 'grant select on table public.booking_participants to authenticated;', 'grant select, insert, update on table public.booking_participants to service_role;']);
  assert.ok(!participantMigration.includes('grant insert on table public.booking_participants to authenticated'));
});

test('customer participant access is bound to exact active owned-device context', () => {
  assert.ok(notificationApi.includes("if(request.method==='GET'&&!path[1])"), 'nested participant GET is intercepted by the root ownership listing');
  const route = notificationApi.slice(notificationApi.indexOf("if(path[1]&&path[2]==='participants')"), notificationApi.indexOf("if(path[1]&&path[2]==='preferences'"));
  contains(notificationApi, ["id=? AND subscription_id=? AND entity_type=? AND revoked_at IS NULL", "booking_request_id: `eq.${bookingId}`"]);
  assert.ok(notificationApi.indexOf('notification_subscription_ownership WHERE id=?') < notificationApi.indexOf("backendRows(config, 'booking_participants'"));
  assert.ok(!/booking_code|gift_card|customer_email|customer_phone/.test(route));
});

test('internal booking locator is copied atomically but never returned publicly', () => {
  contains(locatorMigration, ['ADD COLUMN entity_id', 'c.entity_id IS NEW.entity_id']);
  contains(ownershipHelper, ['entityId.trim()', 'locatorSupported']);
  const ownershipList = notificationApi.slice(notificationApi.indexOf("if(request.method==='GET'&&!path[1])"), notificationApi.indexOf("if(path[1]==='claim'"));
  assert.ok(!ownershipList.includes('entity_id'));
});

test('D1 rejects an ownership locator that differs from its claim', () => {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_notifications.sql','0002_campaign_lifecycle.sql','0003_admin_automation_jobs.sql','0004_customer_notification_ownership.sql','0005_customer_notification_operations.sql','0006_participant_ownership_locator.sql']) db.exec(read(`workers/notifications/migrations/${file}`));
  const now = '2026-09-05T10:00:00Z'; const booking = '11111111-1111-4111-8111-111111111111';
  db.prepare("INSERT INTO notification_subscriptions(id,audience,app_variant,device_id,device_token_hash,endpoint,enabled,created_at,updated_at,last_seen_at) VALUES('s','public','public','d',?,'inapp://public/s',1,?,?,?)").run('b'.repeat(64),now,now,now);
  db.prepare("INSERT INTO notification_ownership_claims(id,token_hash,entity_type,entity_ref,entity_id,journey_type,status,claimed_subscription_id,expires_at,claimed_at,created_at) VALUES('c',?,'booking_request',?,?,'booking','claimed','s','2099-01-01T00:00:00Z',?,?)").run('a'.repeat(64),'e'.repeat(64),booking,now,now);
  assert.throws(() => db.prepare("INSERT INTO notification_subscription_ownership(id,claim_id,subscription_id,entity_type,entity_ref,entity_id,journey_type,verified_at,created_at) VALUES('o','c','s','booking_request',?,?, 'booking',?,?)").run('e'.repeat(64),'22222222-2222-4222-8222-222222222222',now,now), /ownership_claim_scope_mismatch/);
  db.close();
});

test('customer and Admin participant UI are guarded when schema is not deployed', () => {
  contains(notificationApi, ['participant_foundation_unavailable']);
  contains(notificationUi, ['err.status===503', 'Participant details are not available for this link yet. Notifications continue to work normally.']);
  contains(bookingService, ["['42P01', 'PGRST205']", 'participant_foundation_available: !participantSchemaUnavailable']);
  contains(main, ['AdminParticipantSummary', 'Participant foundation is not available in this environment yet.']);
});

test('participant UI is responsive and not table-only', () => {
  contains(notificationCss, ['.owned-participant-list article', 'overflow-wrap:anywhere', '@media(max-width:700px)', '.owned-participant-form{grid-template-columns:1fr}']);
  assert.ok(!notificationUi.includes('<table'));
});

test('Terms evidence remains separate from participant records', () => {
  assert.ok(!/terms_versions|terms_acceptances|self_accepted|accepted_by_guardian/.test(participantMigration));
  assert.ok(participantMigration.includes('This table is not Terms acceptance evidence.'));
  assert.ok(termsDoc.includes('Phase 2 Terms evidence is implemented'));
  assert.ok(termsDoc.includes('Individual-adult and guardian journeys remain deferred'));
});

test('Finance and notification ownership remain independent of participant rows', () => {
  assert.ok(!/finance_entries|expected income|revenue/i.test(participantMigration));
  assert.ok(locatorMigration.includes('Existing hashed ownerships remain valid and are intentionally not backfilled.'));
  assert.ok(notificationApi.includes('participant_foundation_unavailable'));
});

let passed = 0; const failures = [];
for (const [name, run] of tests) { try { await run(); passed += 1; console.log(`PASS  ${name}`); } catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL  ${name}: ${error.message}`); } }
console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length) process.exit(1);

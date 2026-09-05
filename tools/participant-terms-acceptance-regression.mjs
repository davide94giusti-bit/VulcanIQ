import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

import {
  createParticipantTermsToken,
  isParticipantTermsToken,
  participantTermsAcceptanceUrl,
  participantTermsTokenHash
} from '../functions/api/public/_participantTerms.js';
import { participantTermsContentSnapshot } from '../functions/api/public/terms-acceptance/[[path]].js';

const read = (file) => fs.readFileSync(file, 'utf8');
const migration = read('supabase/migrations/20260905120000_participant_terms_acceptance_journeys.sql');
const hardeningMigration = read('supabase/migrations/20260905130000_participant_terms_email_delivery_hardening.sql');
const localSql = read('supabase/tests/participant_terms_acceptance_local.sql');
const priorParticipants = read('supabase/migrations/20260905100000_booking_participants_foundation.sql');
const priorTerms = read('supabase/migrations/20260905110000_terms_evidence_foundation.sql');
const publicHelper = read('functions/api/public/_participantTerms.js');
const publicApi = read('functions/api/public/terms-acceptance/[[path]].js');
const ownedApi = read('functions/api/notifications/[[path]].js');
const deliveryFunction = read('supabase/functions/send-participant-terms-invitation/index.ts');
const deliveryEmail = read('supabase/functions/_shared/participantTermsInvitationEmail.ts');
const supabaseConfig = read('supabase/config.toml');
const publicPage = read('src/features/legal/ParticipantTermsAcceptancePage.jsx');
const publicPageCss = read('src/features/legal/participantTermsAcceptance.css');
const ownedUi = read('src/features/notifications/NotificationsPage.jsx');
const ownedCss = read('src/features/notifications/notifications.css');
const notificationService = read('src/services/notificationService.js');
const acceptanceService = read('src/services/participantTermsAcceptance.js');
const bookingService = read('src/services/bookingRequests.js');
const main = read('src/main.jsx');
const routes = read('src/app/publicRoutes.js');
const redirects = read('public/_redirects');
const headers = read('public/_headers');
const config = read('workers/notifications/wrangler.toml');
const docs = read('docs/PARTICIPANT_TERMS_ACCEPTANCE_PHASE3_20260905.md');
const packageJson = read('package.json');

function has(source, ...values) {
  for (const value of values) assert.ok(source.includes(value), `missing ${value}`);
}
function lacks(source, ...values) {
  for (const value of values) assert.ok(!source.includes(value), `unexpected ${value}`);
}
function sqlFunctionFrom(source, name) {
  const start = source.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `missing SQL function ${name}`);
  const end = source.indexOf('\n$$;', start);
  assert.notEqual(end, -1, `unterminated SQL function ${name}`);
  return source.slice(start, end + 4);
}
const sqlFunction = (name) => sqlFunctionFrom(migration, name);
function section(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `missing ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `missing ${endToken}`);
  return source.slice(start, end);
}

const lifecycle = sqlFunction('protect_terms_acceptance_invitation_lifecycle()');
const issue = sqlFunction('issue_participant_terms_acceptance_invitation(');
const revoke = sqlFunction('revoke_participant_terms_acceptance_invitation(');
const resolve = sqlFunction('resolve_participant_terms_acceptance_invitation(');
const accept = sqlFunction('accept_participant_terms_acceptance_invitation(');
const hardenedIssue = sqlFunctionFrom(hardeningMigration, 'issue_participant_terms_acceptance_invitation(');
const failedDeliveryRevoke = sqlFunctionFrom(hardeningMigration, 'revoke_failed_participant_terms_email_invitation(');
const ownedGuardian = sqlFunctionFrom(hardeningMigration, 'record_owned_organizer_guardian_terms_acceptance(');
const ownedInvitationRoute = section(ownedApi, "if(path[1]&&path[2]==='participants'&&path[3]&&path[4]==='terms-invitation')", "if(path[1]&&path[2]==='participants'&&path[3]&&path[4]==='terms-acceptance'");
const ownedGuardianRoute = section(ownedApi, "if(path[1]&&path[2]==='participants'&&path[3]&&path[4]==='terms-acceptance'", "if(path[1]&&path[2]==='participants')");
const ownedPayload = section(ownedApi, 'async function ownedTermsPayload', 'function customerPreferenceColumn');
const adminTerms = section(main, 'function AdminTermsSummary', 'function ReplyTools');
const tests = [];
const test = (name, run) => tests.push([name, run]);

test('1 Phase 3 foundation remains additive and hardening uses a forward migration', () => { has(migration, 'create table public.terms_acceptance_invitations', 'additive, publishes no Terms'); has(hardeningMigration, 'Phase 3 evidentiary hardening', 'begin;', 'commit;'); });
test('2 applied participant Terms and invitation migrations remain independent', () => { lacks(priorParticipants, 'terms_acceptance_invitations'); lacks(priorTerms, 'terms_acceptance_invitations'); lacks(migration, 'participant_email_delivery', 'record_owned_organizer_guardian_terms_acceptance'); });
test('3 migrations publish no Terms and fabricate no historical acceptance', () => { lacks(migration, 'insert into public.terms_versions'); lacks(hardeningMigration, 'insert into public.terms_versions'); assert.equal((migration.match(/insert into public\.terms_acceptances/g) || []).length, 1); assert.equal((hardeningMigration.match(/insert into public\.terms_acceptances/g) || []).length, 1); });
test('4 invitation scope contains target actor issuer booking and exact version', () => has(migration, 'booking_request_id uuid not null', 'participant_id uuid not null', 'actor_participant_id uuid not null', 'issued_by_participant_id uuid not null', 'terms_version_id uuid not null'));
test('5 invitations duplicate no destination PII or raw token', () => lacks(migration + hardeningMigration, 'raw_token', 'customer_email', 'customer_phone', 'destination_snapshot', 'recipient_email', 'ip_address', 'fingerprint', 'geolocation'));
test('6 token storage is constrained to a lowercase SHA-256 digest', () => has(migration, 'token_hash text not null unique', "token_hash ~ '^[0-9a-f]{64}$'"));
test('7 invitation expiry is mandatory and after issuance', () => has(migration, 'expires_at timestamptz not null', 'check (expires_at > issued_at)'));
test('8 invitation state is timestamp-derived rather than a mutable status flag', () => lacks(migration, 'status text'));
test('9 terminal consumption and revocation are mutually exclusive', () => has(migration, 'terms_acceptance_invitations_terminal_state_check', 'check (consumed_at is null or revoked_at is null)'));
test('10 only one open invitation per participant and version can exist', () => has(migration, 'terms_acceptance_invitations_one_open_idx', 'where consumed_at is null and revoked_at is null'));
test('11 invitation scope cannot be rewritten', () => has(lifecycle, 'terms_invitation_scope_immutable', 'new.token_hash', 'new.terms_version_id', 'new.actor_participant_id'));
test('12 consumed and revoked lifecycle transitions cannot be reversed', () => has(lifecycle, 'terms_invitation_consumption_immutable', 'terms_invitation_revocation_immutable'));
test('13 invitation deletion is rejected while evidence remains append-only', () => { has(lifecycle, "tg_op = 'DELETE'", 'terms_invitation_history_immutable'); has(priorTerms, 'create trigger terms_acceptances_immutable'); });
test('14 invitation consumption must link matching acceptance evidence', () => has(lifecycle, 'terms_invitation_acceptance_invalid', 'acceptance.actor_participant_id = new.actor_participant_id', 'acceptance.terms_version_id = new.terms_version_id'));
test('15 relation RLS is Admin read-only with no direct application writes', () => has(migration, 'enable row level security', 'Admins can view Terms acceptance invitations', 'using (public.is_admin())', 'revoke all privileges on table public.terms_acceptance_invitations', 'grant select on table public.terms_acceptance_invitations'));
test('16 every lifecycle RPC is service-role-only', () => { for (const name of ['issue_participant_terms_acceptance_invitation', 'revoke_participant_terms_acceptance_invitation', 'resolve_participant_terms_acceptance_invitation', 'accept_participant_terms_acceptance_invitation']) has(migration, `revoke all on function public.${name}`, `grant execute on function public.${name}`); });
test('17 issue locks and requires an accepted booking', () => has(hardenedIssue, 'from public.booking_requests booking', 'for update', "booking_row.status <> 'accepted'"));
test('18 issue requires the active adult organizer of the same booking', () => has(hardenedIssue, 'p_organizer_participant_id', "participant.is_organizer = true", "participant.participant_type = 'adult'", "participant.status = 'active'"));
test('19 organizer cannot issue a self link through another participant path', () => has(hardenedIssue, 'target_row.is_organizer', 'terms_invitation_participant_invalid'));
test('20 adult invitation derives actor equals target and self representation', () => has(hardenedIssue, "target_row.participant_type = 'adult'", 'actor_row := target_row', "invitation_representation := 'self'"));
test('21 minor email invitation derives only a non-organizer configured active adult guardian', () => has(hardenedIssue, "target_row.participant_type = 'minor'", 'target_row.guardian_participant_id', "participant.participant_type = 'adult'", 'actor_row.is_organizer', 'terms_invitation_guardian_owned_flow_required', "invitation_representation := 'parent_or_guardian'"));
test('22 issue resolves current excursion Terms at the post-lock wall-clock linearization point', () => { has(hardenedIssue, "version.document_purpose = 'excursion_booking'", 'version.locale = p_locale', 'version.effective_at <= now_at', 'version.published_at <= now_at', 'terms_version_unavailable'); assert.ok(hardenedIssue.indexOf('now_at := clock_timestamp()') < hardenedIssue.indexOf('from public.terms_versions version')); });
test('23 no-current-Terms failure precedes invitation mutation', () => assert.ok(hardenedIssue.indexOf('terms_version_unavailable') < hardenedIssue.indexOf('update public.terms_acceptance_invitations')));
test('24 completed current participant acceptance blocks another invitation', () => has(hardenedIssue, 'terms_participant_already_accepted', 'acceptance.representation_type = invitation_representation'));
test('25 reissue revokes every prior open participant invitation without deletion', () => has(hardenedIssue, "revocation_reason = 'superseded'", 'invitation.participant_id = target_row.id', 'invitation.consumed_at is null', 'invitation.revoked_at is null'));
test('26 invitation lifetime is the repository-standard 24 hours', () => has(hardenedIssue, "now_at + interval '24 hours'"));
test('27 revoke is participant-scoped and has no stale invitation-id parameter', () => { has(revoke, 'p_participant_id uuid', 'revoked_count_value'); lacks(revoke, 'p_invitation_id'); });
test('28 revoke serializes booking participants then every open invitation', () => { const bookingLock = revoke.indexOf('from public.booking_requests booking'); const participantLock = revoke.indexOf('from public.booking_participants participant'); const invitationLock = revoke.indexOf('from public.terms_acceptance_invitations invitation'); assert.ok(bookingLock >= 0 && bookingLock < participantLock && participantLock < invitationLock); has(revoke, 'order by invitation.id', 'for update'); });
test('29 revoke never changes a consumed invitation or acceptance evidence', () => { has(revoke, 'invitation.consumed_at is null'); lacks(revoke, 'delete from public.terms_acceptances', 'update public.terms_acceptances'); });
test('30 resolve rejects invalid expired revoked and consumed state generically', () => has(resolve, 'terms_invitation_unavailable', 'invitation_row.consumed_at is not null', 'invitation_row.revoked_at is not null', 'invitation_row.expires_at <= resolved_at'));
test('31 resolve revalidates booking and active participant scope', () => has(resolve, "booking_row.status <> 'accepted'", "target_row.status <> 'active'", "actor_row.status <> 'active'", 'target_row.booking_request_id <> booking_row.id'));
test('32 resolve binds content to the invitation exact version and locale', () => has(resolve, 'version.id = invitation_row.terms_version_id', 'version.locale = invitation_row.locale', 'version_row.content_snapshot'));
test('33 a newer current version invalidates rather than silently switches a pending link', () => has(resolve, "version.document_purpose = 'excursion_booking'", 'version.locale = invitation_row.locale', 'version.effective_at <= resolved_at', 'current_version_row.id <> version_row.id'));
test('34 accept performs unlocked discovery then authoritative booking lock', () => { has(accept, 'Discovery is intentionally unlocked'); assert.ok(accept.indexOf('where invitation.token_hash = p_token_hash') < accept.indexOf('from public.booking_requests booking')); });
test('35 accept authoritative lock order is booking then deterministic participants then invitation', () => { const bookingLock = accept.indexOf('from public.booking_requests booking'); const participantLock = accept.indexOf('from public.booking_participants participant'); const invitationLock = accept.indexOf('from public.terms_acceptance_invitations invitation', participantLock); assert.ok(bookingLock >= 0 && bookingLock < participantLock && participantLock < invitationLock); has(accept, 'order by participant.id', 'for update'); });
test('36 accept revalidates every invitation scope field after locks', () => has(accept, 'invitation.booking_request_id = booking_row.id', 'invitation.participant_id = discovered_row.participant_id', 'invitation.actor_participant_id = discovered_row.actor_participant_id', 'invitation.terms_version_id = discovered_row.terms_version_id'));
test('37 adult acceptance requires active adult actor equals target', () => has(accept, "invitation_row.representation_type = 'self'", "target_row.participant_type <> 'adult'", 'actor_row.id <> target_row.id'));
test('38 minor self-acceptance is impossible', () => has(accept, "target_row.participant_type <> 'adult'", 'terms_invitation_unavailable'));
test('39 guardian acceptance requires active adult current guardian in same booking', () => has(accept, "invitation_row.representation_type = 'parent_or_guardian'", "target_row.participant_type <> 'minor'", "actor_row.participant_type <> 'adult'", 'target_row.guardian_participant_id <> actor_row.id'));
test('40 acceptance writes actor target representation and participant source', () => has(accept, 'target_row.id', 'actor_row.id', 'invitation_row.representation_type', "'participant_invitation'"));
test('41 acceptance and invitation consumption occur in one RPC transaction', () => assert.ok(accept.indexOf('insert into public.terms_acceptances') < accept.indexOf('update public.terms_acceptance_invitations')));
test('42 duplicate acceptance is idempotent and creates no second evidence row', () => has(accept, 'on conflict do nothing', 'acceptance_was_existing := true', 'consumed_terms_acceptance_id = acceptance_row.id'));
test('43 consumed replay returns only matching historical evidence as idempotent', () => has(accept, 'if invitation_row.consumed_at is not null', 'acceptance.id = invitation_row.consumed_terms_acceptance_id', 'true;'));
test('44 token generator provides 256 bits in lowercase URL-safe hex', () => { const token = createParticipantTermsToken(); assert.match(token, /^[a-f0-9]{64}$/); assert.equal(isParticipantTermsToken(token), true); assert.throws(() => createParticipantTermsToken(31), /entropy_insufficient/); });
test('45 generated tokens are not sequential or repeated', () => { const values = new Set(Array.from({ length: 32 }, () => createParticipantTermsToken())); assert.equal(values.size, 32); });
test('46 token hashing is deterministic SHA-256 and differs from raw', async () => { const token = createParticipantTermsToken(); const first = await participantTermsTokenHash(token); assert.equal(first, await participantTermsTokenHash(token)); assert.match(first, /^[a-f0-9]{64}$/); assert.notEqual(first, token); });
test('47 invitation URL uses only a token fragment and no participant name', () => { const token = createParticipantTermsToken(); const value = participantTermsAcceptanceUrl({ url: 'https://preview.example/api/notifications/ownership/x' }, token); const url = new URL(value); assert.equal(url.pathname, '/terms-acceptance'); assert.equal(url.search, ''); assert.equal(url.hash, `#token=${token}`); assert.ok(!value.includes('Mario')); has(deliveryFunction, "acceptanceUrl.hash = `token=${rawToken}`"); });
test('48 token generation and delivery have no persistence logging or analytics coupling', () => { lacks(publicHelper, 'localStorage', 'sessionStorage', 'console.', 'trackEvent', 'analytics'); lacks(deliveryFunction, 'console.', 'localStorage', 'sessionStorage', 'trackEvent', 'analytics', 'NOTIFICATIONS_DB'); });
test('49 public acceptance API is POST-only with bounded exact-key JSON', () => has(publicApi, "request.method !== 'POST'", 'readJsonBody(request, 2048)', "new Set(['token'])", "new Set(['token', 'accepted'])", 'exactKeys'));
test('50 public resolve and confirm use separate actor/global rate limits', () => has(publicApi, 'clientActorHash', 'claimPublicRateLimit', 'participant_terms_${action}', 'actorLimit: 30', 'actorLimit: 8'));
test('51 public API hashes before calling hash-only RPCs', () => has(publicApi, 'participantTermsTokenHash(token)', "p_token_hash: tokenHash", 'resolve_participant_terms_acceptance_invitation', 'accept_participant_terms_acceptance_invitation'));
test('52 public lifecycle failures collapse to one generic response', () => has(publicApi, "code: 'terms_invitation_unavailable'", 'function unavailable'));
test('53 missing Phase 3 RPC returns a graceful 503', () => has(publicApi, 'PGRST202', "json(request, env, 503"));
test('54 public resolve response exposes no internal IDs codes contacts payment or hash', () => { const responseBlock = section(publicApi, "return json(request, env, 200, {\n        ok: true,\n        invitation:", "    const { response, result } = await rpc(env, 'accept_participant"); lacks(responseBlock, 'bookingId', 'participantId', 'termsVersionId', 'tokenHash', 'booking_code', 'gift_card', 'email', 'phone', 'payment'); });
test('55 public confirm accepts no client participant actor booking or version', () => lacks(publicApi, 'parsed.value.participantId', 'parsed.value.actorId', 'parsed.value.bookingId', 'parsed.value.termsVersionId'));
test('56 owned invitation actions reuse exact active booking ownership', () => { has(ownedInvitationRoute, 'ownedParticipantContext(database,sub,ownershipId,config)', "invitationContext.booking.status!=='accepted'"); assert.ok(ownedApi.indexOf('notification_subscription_ownership WHERE id=?') < ownedApi.indexOf("backendRows(config, 'booking_participants'")); });
test('57 owned issue/revoke are D1 rate limited and server derive organizer', () => has(ownedInvitationRoute, 'terms-invitation-${action}', 'revokeInvitation?12:6', 'item.is_organizer===true', 'organizerParticipantId:organizer.id'));
test('58 organizer cannot invoke invitation endpoint for themselves', () => has(ownedInvitationRoute, 'participant.is_organizer', 'terms_participant_not_found'));
test('59 organizer API returns only delivery status and never a raw URL or token', () => { has(ownedInvitationRoute, 'deliverParticipantTermsInvitation', 'return json(request,env,201,{ok:true,item})'); lacks(ownedInvitationRoute, 'acceptanceUrl', 'rawToken', 'tokenHash', 'participantTermsAcceptanceUrl', 'createParticipantTermsToken', 'console.'); });
test('60 owned completion validates adult self actor evidence', () => has(ownedPayload, "item.actor_type === 'participant'", "item.representation_type === 'self'", 'item.actor_participant_id === participant.id'));
test('61 immutable minor acceptance remains complete after a later guardian change', () => { has(ownedPayload, "item.representation_type === 'parent_or_guardian'", "item.actor_type === 'participant'", 'Boolean(item.actor_participant_id)'); lacks(ownedPayload.slice(ownedPayload.indexOf('const validAcceptance'), ownedPayload.indexOf('const invitationStatus')), 'item.actor_participant_id === guardian.id'); });
test('62 removed participants are excluded but counted as not required', () => has(ownedPayload, "context.participants.filter((item) => item.status === 'active')", "context.participants.filter((item) => item.status !== 'active').length"));
test('63 no current Terms and incomplete composition can never be complete', () => has(ownedPayload, 'termsAvailable && compositionComplete && acceptedParticipants === requiredParticipants', 'organizerPresent && namedAdults === expectedAdults && namedChildren === expectedChildren'));
test('64 changed guardian invalidates an open invitation status', () => has(ownedPayload, "invitationStatus(item) === 'pending'", '!invitationMatchesParticipant(item, participant)', "? 'invalidated'"));
test('65 client service consumes the fragment once and immediately scrubs it', () => has(acceptanceService, "window.location.hash", 'window.history.replaceState', 'window.location.pathname', 'window.location.search'));
test('66 client token remains memory-only and POST-body-only', () => { lacks(acceptanceService, 'localStorage', 'sessionStorage'); has(acceptanceService, "method: 'POST'", 'body: JSON.stringify(payload)', "credentials: 'omit'", "postAcceptanceAction('confirm', { token, accepted: true })"); });
test('67 public page renders the invitation-bound snapshot rather than current Terms', () => { has(publicPage, 'context.terms.version', 'context.terms.locale', 'terms={context.terms}', 'TermsDocumentModal'); lacks(publicPage, 'getApplicableTerms'); });
test('68 public page requires an unchecked explicit acceptance, focuses errors and renders success only after confirmation', () => has(publicPage, 'useState(false)', 'checkboxRef.current?.focus()', 'aria-invalid={Boolean(error)}', 'confirmParticipantTermsAcceptance(token)', "setState('accepted')"));
test('69 guardian wording is shown only for guardian representation and marked for counsel review', () => has(publicPage, "context.representation === 'parent_or_guardian'", 'target="_blank"', 'Parent and guardian wording requires legal review.'));
test('70 public page omits forbidden booking codes contacts payments IDs and hashes', () => lacks(publicPage, 'bookingCode', 'giftCard', 'customer_email', 'customer_phone', 'payment', 'participantId', 'termsVersionId', 'content_sha256'));
test('71 canonical Privacy Notice route is used', () => has(publicPage, '/privacy-policy', 'Privacy Notice'));
test('72 sensitive route and its trailing-slash alias are nonindexable no-store and no-referrer', () => { has(routes, "page: 'termsAcceptance'", 'indexable: false'); has(redirects, '/terms-acceptance / 200', '/terms-acceptance/ / 200'); has(headers, '/terms-acceptance', '/terms-acceptance/', 'X-Robots-Tag: noindex, nofollow', 'Referrer-Policy: no-referrer', 'Cache-Control: no-store'); });
test('73 normalized sensitive route disables heartbeat pageview Cloudflare analytics and onboarding', () => has(main, "normalizePublicPath(pathname) === '/terms-acceptance'", 'privacyPreferences.analytics === true && !analyticsDisabledForRoute', '!sensitiveAcceptanceRoute) trackLanguageSwitch', '!sensitiveAcceptanceRoute && <StickyMobileBar', '&& !sensitiveAcceptanceRoute}'));
test('74 public page and owned controls are mobile-first and keyboard-sized', () => { has(publicPageCss, 'min-width:0', 'min-height:48px', '@media(max-width:700px)', '@media(max-width:390px)'); has(ownedCss, 'overflow-wrap:anywhere', 'min-height:44px', 'width:100%'); });
test('75 owned UI exposes self acceptance direct invitation delivery and safe lifecycle status', () => { has(ownedUi, 'Accept for myself', 'Send invitation', 'Resend invitation', 'Invitation no longer valid'); lacks(ownedUi, 'Accept for Mario', 'Mark accepted'); });
test('76 organizer UI cannot copy share or render another participant bearer credential', () => lacks(ownedUi, 'navigator.clipboard.writeText', "navigator.share", 'issuedLink', 'acceptanceUrl', 'Copy link', 'Secure link'));
test('77 organizer-as-guardian has an owned explicit acknowledgement action', () => { has(notificationService, 'acceptOwnedGuardianTerms', '/terms-acceptance'); has(ownedGuardianRoute, 'record_owned_organizer_guardian_terms_acceptance', 'participant.guardian_participant_id!==organizer.id'); has(ownedUi, 'Review and accept as parent/guardian', 'I confirm that I am the parent or guardian responsible for this participant'); });
test('78 Admin invitation projection excludes token hash and destination PII', () => { has(bookingService, "supabase.from('terms_acceptance_invitations')"); const query = section(bookingService, "supabase.from('terms_acceptance_invitations')", ".in('booking_request_id'"); lacks(query, 'token_hash', 'email', 'phone', 'destination'); });
test('79 Admin participant Terms remain read-only, representation-aware and invalidate changed-guardian links', () => { has(adminTerms, 'Read-only evidence', "item.representation_type==='self'", "item.representation_type==='parent_or_guardian'", 'terms_invitation_foundation_available', "?'invalidated':'pending'", 'Invitation no longer valid'); lacks(adminTerms, 'Mark accepted', 'insertTerms', 'updateTerms'); });
test('80 local PostgreSQL suite covers lifecycle actors locale authorization and rollback', () => has(localSql, 'participant_terms_test_missing_version_allowed', 'participant_terms_test_reissue_contract', 'participant_terms_test_idempotent_retry', 'participant_terms_test_guardian_evidence', 'participant_terms_test_changed_guardian_allowed', 'participant_terms_test_cross_booking_issue_allowed', 'participant_terms_test_cancelled_booking_allowed', 'participant_terms_test_locale_binding', 'participant_terms_test_old_version_allowed', 'participant_terms_test_browser_table_privilege', 'rollback;'));
test('81 Phase 3 test is wired into the full quality gate', () => has(packageJson, '"test:participant-terms"', 'npm run test:terms && npm run test:participant-terms'));
test('82 Phase 3 documentation records hardening migration not remote no publication D1 or Cron', () => has(docs, '`20260905130000_participant_terms_email_delivery_hardening.sql` is authored for local validation only and has **not** been applied remotely', 'publishes no Terms', 'D1 remains notification/device ownership infrastructure', 'Cron stays off'));
test('83 no Phase 3 D1 migration or reminder automation was added', () => { assert.ok(!fs.readdirSync('workers/notifications/migrations').some((name) => /participant.*terms|terms.*acceptance/i.test(name))); lacks(migration, 'notification_jobs', 'customer_terms_required', 'cron'); });
test('84 Finance Gift Card and ordinary booking-code semantics are untouched', () => lacks(migration + hardeningMigration, 'finance_entries', 'gift_card_requests', 'booking_codes', 'booking_code_expected'));
test('85 notification Cron remains disabled in both Worker environments', () => assert.equal((config.match(/crons = \[\]/g) || []).length, 2));
test('86 source files are valid UTF-8 without common mojibake markers', () => { const files = ['supabase/migrations/20260905120000_participant_terms_acceptance_journeys.sql', 'supabase/migrations/20260905130000_participant_terms_email_delivery_hardening.sql', 'supabase/tests/participant_terms_acceptance_local.sql', 'supabase/functions/send-participant-terms-invitation/index.ts', 'src/features/legal/ParticipantTermsAcceptancePage.jsx', 'docs/PARTICIPANT_TERMS_ACCEPTANCE_PHASE3_20260905.md']; for (const file of files) { const bytes = fs.readFileSync(file); const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); for (const marker of ['Ã', 'Â', 'â€™', 'â€œ', 'â€', '�']) assert.ok(!source.includes(marker), `${file} contains mojibake ${marker}`); } });
test('87 public API returns the immutable Terms text exactly and rejects malformed snapshots', () => {
  const snapshot = {
    intro: '  Intro preserved exactly.\n',
    sections: [{ title: ' Section title ', body: `  ${'evidence '.repeat(2600)}\n` }]
  };
  assert.deepEqual(participantTermsContentSnapshot(snapshot), snapshot);
  assert.equal(participantTermsContentSnapshot({ intro: '', sections: snapshot.sections }), null);
  assert.equal(participantTermsContentSnapshot({ intro: 'Intro', sections: [{ title: 'Title', body: 123 }] }), null);
  assert.equal(participantTermsContentSnapshot({ ...snapshot, hiddenClause: 'not rendered' }), null);
});
test('88 owned revocation remains available after booking cancellation or participant removal', () => {
  const revokeBranch = ownedInvitationRoute.indexOf('if(revokeInvitation){');
  const acceptedBookingCheck = ownedInvitationRoute.indexOf("invitationContext.booking.status!=='accepted'");
  const activeParticipantCheck = ownedInvitationRoute.indexOf("participant.status!=='active'");
  assert.ok(revokeBranch >= 0 && revokeBranch < acceptedBookingCheck && acceptedBookingCheck < activeParticipantCheck);
});
test('89 cancelled bookings show pending links as invalidated and keep the revoke control', () => {
  has(ownedPayload, "context.booking.status !== 'accepted' || !invitationMatchesParticipant", "canRevoke: invitationFoundationAvailable && ['pending', 'invalidated'].includes");
  has(ownedUi, '(item.canInvite||item.canGuardianAccept||item.canRevoke)', 'item.canRevoke&&<button', 'Revoke invitation');
  has(adminTerms, "request.status!=='accepted'||!invitationMatchesParticipant", 'Invitation no longer valid');
});
test('90 closed bookings suppress misleading acceptance-required copy while preserving evidence and revoke', () => {
  has(ownedUi, "bookingClosed=['declined','cancelled','archived'].includes(data.bookingStatus)", 'Booking cancelled · no further acceptance required', "item.status==='accepted'", 'No further acceptance required');
  has(adminTerms, "bookingClosed=['declined','cancelled','archived'].includes(request.status)", 'Booking closed · no further acceptance required', 'Invitation no longer valid');
});
test('91 lifecycle timestamps are captured after authoritative locks and never use transaction-start time for mutation', () => {
  const issueLock = hardenedIssue.indexOf('from public.booking_requests booking');
  const issueClock = hardenedIssue.indexOf('now_at := clock_timestamp()');
  const issueMutation = hardenedIssue.indexOf('update public.terms_acceptance_invitations');
  assert.ok(issueLock >= 0 && issueLock < issueClock && issueClock < issueMutation);
  const revokeInvitationLock = revoke.indexOf('from public.terms_acceptance_invitations invitation');
  const revokeClock = revoke.indexOf('revoked_at_value := clock_timestamp()');
  const revokeMutation = revoke.indexOf('update public.terms_acceptance_invitations');
  assert.ok(revokeInvitationLock >= 0 && revokeInvitationLock < revokeClock && revokeClock < revokeMutation);
  const acceptInvitationLock = accept.indexOf('from public.terms_acceptance_invitations invitation', accept.indexOf('from public.booking_requests booking'));
  const acceptClock = accept.indexOf('accepted_at_value := clock_timestamp()');
  assert.ok(acceptInvitationLock >= 0 && acceptInvitationLock < acceptClock);
  const acceptCurrentVersion = accept.indexOf('from public.terms_versions version', acceptClock);
  assert.ok(acceptClock < acceptCurrentVersion);
  has(accept.slice(acceptCurrentVersion), 'version.effective_at <= accepted_at_value', 'version.published_at <= accepted_at_value', 'current_version_row.id <> version_row.id');
  has(accept, 'set consumed_at = accepted_at_value', 'accepted_at_value,\n    accepted_at_value,\n    accepted_at_value');
  lacks(hardenedIssue.slice(0, issueMutation), 'now_at timestamptz := transaction_timestamp()');
  lacks(revoke.slice(0, revokeMutation), 'revoked_at_value timestamptz := transaction_timestamp()');
});
test('92 Admin current Terms projection matches the canonical timestamp filters and deterministic order', () => has(bookingService, 'const termsAsOf = new Date().toISOString()', ".lte('effective_at', termsAsOf)", ".lte('published_at', termsAsOf)", ".order('effective_at', { ascending: false })", ".order('published_at', { ascending: false })", ".order('id', { ascending: false })"));
test('93 authenticated Admin lifecycle reads exclude the stored token hash', () => {
  const privilegeBlock = section(migration, 'revoke all privileges on table public.terms_acceptance_invitations', 'comment on table public.terms_acceptance_invitations');
  has(privilegeBlock, 'grant select (', 'booking_request_id', 'participant_id', 'revoked_at', ') on public.terms_acceptance_invitations to authenticated', 'grant select on table public.terms_acceptance_invitations to service_role');
  lacks(privilegeBlock, 'token_hash');
  has(localSql, "has_column_privilege('authenticated', 'public.terms_acceptance_invitations', 'token_hash', 'select')");
});
test('94 owned invitation limiter keys have fixed per-subscription cardinality', () => {
  const limiter = ownedInvitationRoute.match(/rateLimit\(database,`terms-invitation-[^`]+`,revokeInvitation\?12:6,3600\)/)?.[0] || '';
  assert.ok(limiter.includes('${action}:${sub.id}'));
  assert.ok(!limiter.includes('${ownershipId}'));
});
test('95 trusted Edge Function is the only raw invitation-token issuer in the organizer journey', () => {
  has(deliveryFunction, 'crypto.getRandomValues(new Uint8Array(32))', 'hashToken(rawToken)', 'resendEmail({', 'PARTICIPANT_TERMS_DELIVERY_SECRET');
  lacks(ownedApi, 'createParticipantTermsToken', 'participantTermsTokenHash', 'participantTermsAcceptanceUrl');
});
test('96 internal delivery authorization is constant-work compared and configured server-side', () => {
  has(deliveryFunction, 'function equalSecret', 'left.length ^ right.length', 'x-vulcaniq-participant-terms-delivery-secret', "env('PARTICIPANT_TERMS_DELIVERY_SECRET')");
  has(supabaseConfig, '[functions.send-participant-terms-invitation]', 'verify_jwt = false');
});
test('97 raw recipient email is length checked used transiently and not persisted', () => {
  has(deliveryFunction, 'raw.length > 254', 'normalizeEmail(input.recipientEmail)', 'to: recipientEmail', 'destinationHint');
  lacks(migration + hardeningMigration, 'recipient_email', 'delivery_email');
  has(ownedUi, 'The address was not added to the booking or notification preferences.', 'it is not linked to notifications.');
});
test('98 organizer response and UI expose only masked delivery result', () => {
  has(deliveryFunction, 'maskEmail(recipientEmail)', "status: 'sent'", 'destinationHint');
  lacks(ownedInvitationRoute + ownedUi, 'acceptanceUrl', 'rawToken', 'tokenHash');
});
test('99 failed transactional delivery revokes only the matching token-scoped invitation', () => {
  has(deliveryFunction, 'revoke_failed_participant_terms_email_invitation', 'p_invitation_id: invitationId', 'p_token_hash: tokenHash');
  has(failedDeliveryRevoke, 'invitation.id = p_invitation_id', 'invitation.token_hash = p_token_hash', "revocation_reason = 'delivery_failed'", 'for update');
});
test('100 new invitations carry truthful direct-email provenance', () => {
  has(hardeningMigration, "alter column source_context set default 'participant_email_delivery'");
  has(hardenedIssue, "'participant_email_delivery'");
  lacks(hardenedIssue, "'owned_booking_copy_link'");
});
test('101 organizer-controlled request cannot select actor booking version or representation', () => {
  has(ownedInvitationRoute, "['locale','recipientEmail']", 'bookingRequestId:invitationContext.bookingId', 'participantId:participant.id', 'organizerParticipantId:organizer.id');
  lacks(ownedInvitationRoute, 'parsed.value.bookingRequestId', 'parsed.value.participantId', 'parsed.value.organizerParticipantId', 'parsed.value.termsVersionId', 'parsed.value.representationType');
});
test('102 organizer-as-guardian acceptance is exact current-version DB evidence and idempotent', () => {
  has(ownedGuardian, "participant.participant_type = 'minor'", 'participant.guardian_participant_id = guardian_row.id', "participant.is_organizer = true", "'parent_or_guardian'", "'owned_booking_guardian'", 'on conflict');
  has(ownedGuardianRoute, 'p_minor_participant_id:participant.id', 'p_guardian_participant_id:organizer.id', 'p_terms_version_id:termsVersionId');
});
test('103 non-organizer guardian uses direct email while organizer guardian cannot receive a bearer link', () => {
  has(hardenedIssue, 'actor_row.is_organizer', 'terms_invitation_guardian_owned_flow_required');
  has(ownedPayload, 'guardian.id !== organizer?.id', 'guardian?.id === organizer.id');
  has(ownedInvitationRoute, "participant.guardian_participant_id===organizer.id", 'terms_guardian_owned_acceptance_required');
});
test('104 guardian RPC is service-role-only and unrelated roles cannot execute it', () => {
  has(hardeningMigration, 'revoke all on function public.record_owned_organizer_guardian_terms_acceptance', 'from public, anon, authenticated, service_role', 'grant execute on function public.record_owned_organizer_guardian_terms_acceptance', 'to service_role');
});
test('105 delivery email remains independent of notification ownership and D1', () => {
  lacks(deliveryFunction, 'notification_subscription_ownership', 'notification_ownership_claims', 'NOTIFICATIONS_DB');
  lacks(ownedInvitationRoute, 'INSERT INTO notification_', 'UPDATE notification_subscription_ownership');
});
test('106 delivery secrets and canonical acceptance base stay out of browser-prefixed configuration', () => {
  has(deliveryFunction, "env('PARTICIPANT_TERMS_ACCEPTANCE_BASE_URL')", "env('PARTICIPANT_TERMS_FROM_EMAIL', false)");
  lacks(deliveryFunction + ownedApi, 'VITE_PARTICIPANT_TERMS');
});
test('107 direct delivery email contains no booking code Gift Card code contact or other participant data', () => {
  has(deliveryEmail, 'Review and accept your vulcanIQ experience Terms', 'Do not forward it.');
  lacks(deliveryEmail, 'bookingCode', 'booking code', 'Gift Card', 'recipientEmail', 'participantName', 'phone', 'payment');
});
test('108 any pre-hardening organizer-copyable open invitation is invalidated without deleting evidence', () => {
  has(hardeningMigration, "invitation.source_context = 'owned_booking_copy_link'", "revocation_reason = 'manual'", 'invitation.consumed_at is null', 'invitation.revoked_at is null');
  lacks(hardeningMigration, 'delete from public.terms_acceptance_invitations', 'delete from public.terms_acceptances');
});
test('109 missing Edge delivery configuration fails closed as unavailable', () => {
  has(ownedApi, "response.status === 503", "throw new Error('terms_delivery_not_configured')");
  has(ownedInvitationRoute, "includes('not_configured')", "json(request,env,503,{ok:false,error:'terms_invitation_delivery_unavailable'})");
  has(deliveryFunction, 'expectedSecret.length < 32', "code: 'delivery_not_configured'");
  assert.ok(deliveryFunction.indexOf('const acceptanceUrl = acceptanceBaseUrl()') < deliveryFunction.indexOf("dbJson('rpc/issue_participant_terms_acceptance_invitation'"));
});

let passed = 0;
const failures = [];
for (const [name, run] of tests) {
  try {
    await run();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`FAIL  ${name}: ${error.message}`);
  }
}
console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length) process.exit(1);

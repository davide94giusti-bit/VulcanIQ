import fs from 'node:fs';
import path from 'node:path';
import { resolveSupabaseBackendCredential, supabaseBackendHeaders } from '../functions/api/_shared/supabaseBackend.js';
import { resolveSupabaseEdgeSecretKey } from '../supabase/functions/_shared/supabaseSecretKey.js';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const passes = [];

function check(name, condition, detail = '') {
  if (condition) passes.push(name);
  else failures.push(`${name}${detail ? `: ${detail}` : ''}`);
}

function failsWith(callback, message) {
  try { callback(); } catch (error) { return error?.message === message; }
  return false;
}

const packageJson = JSON.parse(read('package.json'));
const migration = read('supabase/migrations/20260726090000_automation_notifications_weekly_security.sql');
const storageMigration = read('supabase/migrations/20260726100000_storage_security_hardening.sql');
const mediaOptimizerMigration = read('supabase/migrations/20260819150000_admin_media_optimizer.sql');
const bookingService = read('src/services/bookingRequests.js');
const giftService = read('src/services/giftCards.js');
const bookingEndpoint = read('functions/api/public/booking-request.js');
const giftEndpoint = read('functions/api/public/gift-card-request.js');
const reviewTranslationClient = read('src/features/reviews/reviewTranslation.js');
const analytics = read('src/analytics.js');
const backupShared = read('functions/api/admin/backup/_shared.js');
const backupCreate = read('functions/api/admin/backup/create.js');
const notifyFunction = read('supabase/functions/notify-new-request/index.ts');
const recapFunction = read('supabase/functions/send-weekly-admin-recap/index.ts');
const weeklyRecapSetup = read('supabase/setup/20260726_weekly_recap_cron.sql');
const followupMigration = read('supabase/migrations/20260817090000_operational_analytics_reporting_fix.sql');
const weeklyEmail = read('supabase/functions/_shared/weeklyRecapEmail.ts');
const operationsService = read('src/services/operationsService.js');
const mainSource = read('src/main.jsx');
const analyticsIntegrity = read('src/features/analytics/integrity.js');
const analyticsContract = read('src/features/analytics/contract.js');
const analyticsConsolidation = read('supabase/migrations/20260818090000_analytics_consolidation.sql');
const analyticsService = read('src/services/analyticsService.js');
const analyticsIngestion = read('functions/api/analytics/event.js');
const publicApiShared = read('functions/api/public/_shared.js');
const backendCredentialHelper = read('functions/api/_shared/supabaseBackend.js');
const storageExport = read('scripts/export-supabase-storage.mjs');
const storageRestore = read('scripts/restore-storage.js');
const backupWorkflow = read('.github/workflows/vulcaniq-db-backup.yml');
const edgeFunctionShared = read('supabase/functions/_shared/vulcaniq.ts');
const edgeSecretKeyHelper = read('supabase/functions/_shared/supabaseSecretKey.js');
const safeguardsComponent = read('src/features/admin/OperationalSafeguardsBanner.jsx');
const weeklyPanelComponent = read('src/features/system/WeeklyReportsAdminPanel.jsx');
const premodernMigration = read('supabase/migrations/20260818150000_reviews_google_session_hardening.sql');
const googleReviewsSync = read('supabase/functions/google-reviews-sync/index.ts');
const googleBusinessShared = read('supabase/functions/_shared/googleBusiness.ts');
const googleReviewsClient = read('src/services/googleReviewsService.js');
const securityHeaders = read('public/_headers');
const requestNotificationEmail = read('supabase/functions/_shared/requestNotificationEmail.ts');
const paymentFinanceMigration = read('supabase/migrations/20260821070000_payment_finance_semantics.sql');
const financeRefundMigration = read('supabase/migrations/20260821073000_finance_refund_rpc.sql');
const notificationApi = read('functions/api/notifications/[[path]].js');
const notificationWorker = read('workers/notifications/src/index.js');
const notificationService = read('src/services/notificationService.js');
const privacyPreferenceService = read('src/services/privacyPreferences.js');
const privacyPreferenceUi = read('src/features/privacy/PrivacyPreferences.jsx');
const termsArchitecture = read('docs/PWA_PRIVACY_TERMS_ARCHITECTURE_20260905.md');
const financeAuditEndpoint = read('functions/api/admin/finance-audit.js');
const financeAuditService = read('src/services/financeAuditService.js');
const bootstrapFoundation = read('supabase/migrations/20260601000000_vulcaniq_bootstrap_foundation.sql');
const revenueFollowup = read('supabase/migrations/20260705090000_revenue_os_followup.sql');
const privilegeReconciliation = read('supabase/migrations/20260824120000_privilege_security_reconciliation.sql');
const claimMigration = read('supabase/migrations/20260824100000_booking_code_gift_card_claim_notifications.sql');
const giftClaimEndpoint = read('functions/api/public/gift-card-claim.js');
const bookingCodeService = read('src/services/bookingCodes.js');
const claimFunctionBlock = claimMigration.slice(
  claimMigration.indexOf('create or replace function public.redeem_gift_card_booking_code'),
  claimMigration.indexOf('revoke all on function public.redeem_gift_card_booking_code')
);
const adminGiftFunctionBlock = claimMigration.slice(
  claimMigration.indexOf('create or replace function public.admin_update_gift_card_request'),
  claimMigration.indexOf('create or replace function public.redeem_gift_card_booking_code')
);
const giftIssuanceBlock = adminGiftFunctionBlock.slice(
  adminGiftFunctionBlock.indexOf("if next_status = 'issued'"),
  adminGiftFunctionBlock.indexOf("elsif next_status = 'cancelled'")
);
const giftRowLock = /select\s+\*\s+into\s+gift\s+from\s+public\.gift_card_requests\s+where\s+id\s*=\s*code_row\.gift_card_request_id\s+for update;/i.exec(claimFunctionBlock);
const bookingCodeRowLock = /select\s+\*\s+into\s+code_row\s+from\s+public\.booking_codes\s+where\s+id\s*=\s*code_row\.id\s+for update;/i.exec(claimFunctionBlock);

check('jose dependency pinned', packageJson.dependencies?.jose === '5.9.6');
check('GitHub App credentials supported', ['GITHUB_APP_ID', 'GITHUB_APP_INSTALLATION_ID', 'GITHUB_APP_PRIVATE_KEY'].every((key) => backupShared.includes(key)));
check('GitHub App preferred with temporary PAT fallback', backupShared.includes('legacy_pat') && backupShared.includes('github_app'));
check('Supabase backend Secret key is preferred with a legacy rollback fallback', (() => { const credential = resolveSupabaseBackendCredential({ SUPABASE_SECRET_KEY: 'sb_secret_regression_example', SUPABASE_SERVICE_ROLE_KEY: 'legacy.header.signature' }); return credential?.kind === 'secret' && credential.source === 'SUPABASE_SECRET_KEY' && credential.key === 'sb_secret_regression_example'; })());
check('legacy Supabase service-role credential remains supported temporarily', (() => { const credential = resolveSupabaseBackendCredential({ SUPABASE_SERVICE_ROLE_KEY: 'legacy.header.signature' }); const headers = supabaseBackendHeaders(credential); return credential?.kind === 'legacy_service_role' && headers.apikey === credential.key && headers.Authorization === `Bearer ${credential.key}`; })());
check('opaque Supabase Secret key is API-key-only and never treated as a bearer JWT', (() => { const credential = resolveSupabaseBackendCredential({ SUPABASE_SECRET_KEY: 'sb_secret_regression_example' }); const headers = supabaseBackendHeaders(credential); return headers.apikey === credential.key && !('Authorization' in headers); })());
check('user JWT remains a distinct bearer credential when combined with a backend API key', (() => { const credential = resolveSupabaseBackendCredential({ SUPABASE_SECRET_KEY: 'sb_secret_regression_example' }); const headers = supabaseBackendHeaders(credential, { userAccessToken: 'user.jwt.signature' }); return headers.apikey === credential.key && headers.Authorization === 'Bearer user.jwt.signature'; })());
check('malformed preferred Supabase Secret key fails closed instead of falling back', (() => { try { resolveSupabaseBackendCredential({ SUPABASE_SECRET_KEY: 'not-a-secret-key', SUPABASE_SERVICE_ROLE_KEY: 'legacy.header.signature' }); return false; } catch (error) { return error.message === 'invalid_supabase_secret_key'; } })());
check('Edge Secret map selects the configured named key deterministically', resolveSupabaseEdgeSecretKey({ serializedKeys: JSON.stringify({ other: 'sb_secret_other_regression', vulcaniq: 'sb_secret_named_regression' }), keyName: 'vulcaniq' }) === 'sb_secret_named_regression');
check('Edge Secret map uses default only when no name is configured', resolveSupabaseEdgeSecretKey({ serializedKeys: JSON.stringify({ other: 'sb_secret_other_regression', default: 'sb_secret_default_regression' }) }) === 'sb_secret_default_regression');
check('Edge Secret map fails closed when the configured name is absent', failsWith(() => resolveSupabaseEdgeSecretKey({ serializedKeys: JSON.stringify({ default: 'sb_secret_default_regression' }), keyName: 'missing' }), 'missing_supabase_secret_key_name'));
check('Edge Secret map fails closed when the selected value is malformed', failsWith(() => resolveSupabaseEdgeSecretKey({ serializedKeys: JSON.stringify({ vulcaniq: 'not-a-secret-key' }), keyName: 'vulcaniq' }), 'invalid_supabase_secret_key_name'));
check('backend credential helper rejects Authorization header overrides case-insensitively', failsWith(() => supabaseBackendHeaders(resolveSupabaseBackendCredential({ SUPABASE_SECRET_KEY: 'sb_secret_regression_example' }), { headers: { authorization: 'Bearer attacker.jwt' } }), 'supabase_auth_header_override_forbidden'));
check('backend credential helper rejects apikey overrides for Headers input', failsWith(() => supabaseBackendHeaders(resolveSupabaseBackendCredential({ SUPABASE_SECRET_KEY: 'sb_secret_regression_example' }), { headers: new Headers({ ApiKey: 'attacker-key' }) }), 'supabase_auth_header_override_forbidden'));
check('backup endpoint validates JSON/body size', backupCreate.includes('readRequestJsonWithinLimit') && backupCreate.includes('requestHasJsonContentType'));
check('backup endpoint is rate limited', backupCreate.includes('claimAdminActionRateLimit'));
const publicBookingSection = bookingService.slice(bookingService.indexOf('export async function createPublicBookingRequest'), bookingService.indexOf('export async function createManualBookingRequest'));
check('public booking uses server endpoint', publicBookingSection.includes("fetch('/api/public/booking-request'") && !publicBookingSection.includes(".from('booking_requests')"));
check('public Gift Card uses server endpoint', giftService.includes("fetch('/api/public/gift-card-request'") && !giftService.includes(".from('gift_card_requests')\n    .insert"));
check('public endpoints require idempotency', bookingEndpoint.includes('idempotencyKey') && giftEndpoint.includes('idempotencyKey'));
check('public endpoints apply rate limiting', bookingEndpoint.includes('claimPublicRateLimit') && giftEndpoint.includes('claimPublicRateLimit'));
check('Gift Card claim uses a trusted rate-limited public endpoint', giftClaimEndpoint.includes('claimPublicRateLimit') && giftClaimEndpoint.includes("supabaseRpc(context.env, 'redeem_gift_card_booking_code'") && bookingCodeService.includes("fetch('/api/public/gift-card-claim'"));
check('Gift Card claim endpoint validates recipient ownership fields', ['recipientName', 'recipientEmail', 'recipientPhone', 'validEmail', 'validPhone', 'RECIPIENT_CONTACT_REQUIRED', 'ALLOWED_LANGUAGES'].every((value) => giftClaimEndpoint.includes(value)));
check('Gift Card claim endpoint rejects raw over-limit contact values', giftClaimEndpoint.includes('rawEmail.length > 254') && giftClaimEndpoint.includes('rawPhone.length > 40'));
check('Gift Card claim service credentials remain server-only', giftClaimEndpoint.includes('supabaseRpc') && !bookingCodeService.includes('SUPABASE_SERVICE_ROLE_KEY'));
check('public endpoints support Turnstile', bookingEndpoint.includes('verifyTurnstile') && giftEndpoint.includes('verifyTurnstile'));
check('public booking cannot set partner authority', !bookingEndpoint.includes('partner_id:') && !bookingEndpoint.includes('partner_source_assigned_by:'));
check('server RPC ignores public partner authority', !migration.match(/request_payload->>'partner_id'/) && !migration.match(/request_payload->>'partner_source_assigned_by'/));
check('direct anonymous operational inserts revoked', migration.includes('revoke insert on public.booking_requests from anon') && migration.includes('revoke insert on public.gift_card_requests from anon'));
check('analytics direct inserts revoked', migration.includes('revoke insert on public.analytics_events from anon, authenticated'));
check('private operational tables have RLS', ['request_notification_log', 'admin_weekly_reports', 'endpoint_rate_limits'].every((table) => migration.includes(`alter table public.${table} enable row level security`)));
check('no globally permissive policy in new migrations', !/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i.test(`${migration}\n${storageMigration}\n${mediaOptimizerMigration}\n${analyticsConsolidation}\n${premodernMigration}`));
check('Gift Card claim RPC is hardened and service-role-only', claimMigration.includes('create or replace function public.redeem_gift_card_booking_code') && claimMigration.includes('security definer') && claimMigration.includes('set search_path = public, pg_temp') && claimMigration.includes('from public, anon, authenticated') && claimMigration.includes('to service_role'));
check('generic booking-code RPC cannot bypass Gift Card claim', claimMigration.includes("code_row.source = 'gift_card' or code_row.gift_card_request_id is not null") && claimMigration.includes("'error', 'GIFT_CARD_CLAIM_REQUIRED'") && claimMigration.includes("'requires_recipient_claim', true"));
check('Gift Card claim locks Gift Card then booking code inside the claim function', Boolean(giftRowLock) && Boolean(bookingCodeRowLock) && giftRowLock.index < bookingCodeRowLock.index);
check('Gift Card claim revalidates ownership and rejects repeat claims after locking', claimFunctionBlock.includes('code_row.gift_card_request_id is distinct from gift.id') && claimFunctionBlock.includes("code_row.status = 'redeemed'") && claimFunctionBlock.includes('gift.recipient_claimed_at is not null'));
check('Gift Card claim rejects malformed contact server-side', claimMigration.includes('RECIPIENT_EMAIL_INVALID') && claimMigration.includes('RECIPIENT_PHONE_INVALID') && claimMigration.includes("clean_language not in ('it', 'en')"));
check('newly issued Gift Card codes never copy purchaser contact', !giftIssuanceBlock.includes('gift.buyer_email') && !giftIssuanceBlock.includes('gift.buyer_phone') && giftIssuanceBlock.includes('gift.recipient_email, gift.recipient_phone'));
check('newly issued Gift Card codes use no noncanonical experience id', giftIssuanceBlock.includes("null, coalesce(gift.experience_type, 'Gift Card vulcanIQ')") && !giftIssuanceBlock.includes("'gift-card', coalesce(gift.experience_type"));
check('Gift Card claim persists every claimant ownership field', ['claimed_recipient_name = clean_name', 'recipient_email = clean_email', 'recipient_phone = clean_phone', 'recipient_preferred_language = clean_language', 'recipient_claimed_at = now()'].every((value) => claimFunctionBlock.includes(value)));
check('Gift Card claim never mutates purchaser identity', !/\bbuyer_(name|email|phone)\b/.test(claimFunctionBlock));
check('Gift Card claim booking uses claimant contact', /insert into public\.booking_requests[\s\S]*?code_row\.fixed_excursion_id,\s*clean_name,\s*clean_email,\s*clean_phone,/i.test(claimFunctionBlock));
check('Gift Card claim only propagates canonical booking experience ids', claimFunctionBlock.includes("code_row.experience_id in ('etna-premium', 'etna-learning', 'etna-live', 'etna-stories', 'unsure')") && claimFunctionBlock.includes('then code_row.experience_id'));
check('legacy noncanonical Gift Card experience ids degrade to null', /when code_row\.experience_id in \([^)]*\)[\s\S]*?then code_row\.experience_id\s+else null\s+end,/i.test(claimFunctionBlock) && !claimFunctionBlock.includes("coalesce(code_row.experience_id, 'gift-card')"));
check('changing a Gift Card code clears prior claimant PII', mainSource.includes('function resetGiftCardClaim()') && mainSource.includes("setClaimForm({ recipient_name: '', recipient_email: '', recipient_phone: '' })") && mainSource.includes('onClick={resetGiftCardClaim}'));
check('Gift Card public claim result excludes purchaser identity and internal UUIDs', !giftClaimEndpoint.includes('buyer_email') && !giftClaimEndpoint.includes('buyer_phone') && !giftClaimEndpoint.includes('booking_request_id') && !giftClaimEndpoint.includes('finance_entry_id'));
check('new Gift Card claim migration is forward-only with no claimant backfill', !/update\s+public\.gift_card_requests[\s\S]{0,240}claimed_recipient_name\s*=/i.test(claimMigration.slice(0, claimMigration.indexOf('create or replace function public.admin_update_gift_card_request'))));
check('notification idempotency index exists', migration.includes('request_notification_log_idempotency_unique'));
check('weekly report idempotency index exists', migration.includes('admin_weekly_reports_idempotency_unique'));
check('privileged actions restricted to owner/manager', migration.includes("ap.role in ('owner', 'manager')") && migration.includes('is_privileged_admin'));
check('Gift Card finance/code changes are server authoritative', giftService.includes("supabase.rpc('admin_update_gift_card_request'") && migration.includes('admin_update_gift_card_request'));
check('Gift Card code remains redeemable by recipient', migration.includes("'unused', auth.uid(), false, 'not_completed', 'paid', 'none'"));
check('canonical booking analytics events exist', ['booking_form_open', 'booking_form_started', 'booking_form_step_completed', 'booking_form_submit_attempt', 'booking_request_created', 'booking_form_submit_success'].every((event) => analytics.includes(`'${event}'`)));
check('first-touch attribution is persisted', analytics.includes('FIRST_TOUCH_KEY') && analytics.includes('getFirstTouchAttribution'));
check('notification function validates webhook secret', notifyFunction.includes('REQUEST_NOTIFICATION_WEBHOOK_SECRET') && notifyFunction.includes('x-vulcaniq-webhook-secret'));
check('notification retries require admin and throttling', notifyFunction.includes('requireAdmin') && notifyFunction.includes('claimAdminAction'));
check('weekly recap validates cron secret', recapFunction.includes('WEEKLY_RECAP_CRON_SECRET') && recapFunction.includes('x-vulcaniq-cron-secret'));
check('weekly recap is DST guarded', recapFunction.includes('isRomeMondayEight') && recapFunction.includes('Europe/Rome'));
check('weekly recap setup targets Monday 08:00 Europe/Rome across DST without duplicate sends', weeklyRecapSetup.includes("'0 6 * * 1'") && weeklyRecapSetup.includes("'0 7 * * 1'") && weeklyRecapSetup.includes('Monday 08:00 Europe/Rome') && recapFunction.includes("values.weekday === 'Mon'") && recapFunction.includes('Number(values.hour) === 8') && recapFunction.includes('Number(values.minute) < 15') && migration.includes('admin_weekly_reports_idempotency_unique'));
check('weekly recap manual send is throttled', recapFunction.includes("claimAdminAction('weekly-recap-manual'"));
check('weekly recap rejects an empty recipient list', recapFunction.includes("if (!targets.length) throw new Error('no_weekly_recap_recipients')"));
check('migration has one transaction boundary', (migration.match(/^begin;$/gm) || []).length === 1 && (migration.match(/^commit;$/gm) || []).length === 1);
check('media optimizer storage migration has one transaction boundary', (mediaOptimizerMigration.match(/^begin;$/gm) || []).length === 1 && (mediaOptimizerMigration.match(/^commit;$/gm) || []).length === 1);
check('Gift Card RPC has no duplicate declaration', !migration.includes('inserted public.gift_card_requests%rowtype;\n  inserted public.gift_card_requests%rowtype;'));
const repositoryFiles = fs.readdirSync(root, { recursive: true })
  .filter((name) => typeof name === 'string' && !name.startsWith('.git/') && !name.includes('node_modules/'));
const keyFiles = repositoryFiles.filter((name) => /(^|\/)(?!.*example)([^/]+\.(pem|key)|id_rsa)$/i.test(name));
check('private key material is not committed', keyFiles.length === 0, keyFiles.join(', '));
check('no service-role VITE variable', !fs.readdirSync(root, { recursive: true }).filter((name) => typeof name === 'string' && !name.startsWith('.git/') && !name.includes('node_modules/')).some((name) => {
  try { return fs.statSync(path.join(root, name)).isFile() && /VITE_[A-Z0-9_]*SERVICE_ROLE/i.test(fs.readFileSync(path.join(root, name), 'utf8')); } catch { return false; }
}));
check('no Supabase Secret VITE variable or browser capability', !repositoryFiles.filter((name) => { const normalized = String(name).replaceAll('\\', '/'); return /\.(?:js|jsx|ts|tsx|md|toml|ya?ml)$/i.test(normalized) && !normalized.startsWith('tools/'); }).some((name) => { try { return /VITE_SUPABASE_SECRET_KEY/.test(read(name)); } catch { return false; } }) && !/SUPABASE_SECRET_KEY/.test(mainSource + bookingService + giftService + notificationService + financeAuditService));
check('no concrete Supabase Secret key value is committed', !/sb_secret_[A-Za-z0-9]{20,}_[A-Za-z0-9]{8}/.test([backendCredentialHelper, notificationWorker, notificationApi, publicApiShared, analyticsIngestion, backupShared, storageExport, storageRestore, backupWorkflow, edgeFunctionShared].join('\n')));

check('weekly recap uses branded email template', recapFunction.includes('buildWeeklyRecapEmail') && weeklyEmail.includes('VULCANIQ · OPERATIONS') && weeklyEmail.includes('Executive overview'));
check('weekly recap separates conversion families', ['Website booking funnel', 'Fast Request / WhatsApp', 'Booking-code funnel', 'Gift Card funnel', 'Gift Card status'].every((value) => weeklyEmail.includes(value)) && recapFunction.includes('rpc/get_admin_analytics_summary'));
check('operational safeguards exclude historical not-sent rows', followupMigration.includes("'safeguard_version', 2") && followupMigration.includes('notifications_historical_excluded') && followupMigration.includes("source = 'website'"));
check('public RPC extension search path is explicit', ['create_public_booking_request(jsonb)', 'create_public_gift_card_request(jsonb)', 'admin_update_gift_card_request(uuid, jsonb)'].every((signature) => followupMigration.includes(`alter function public.${signature}`)) && followupMigration.includes('public, extensions, pg_temp'));
check('analytics distinguishes current tracking from history', analyticsContract.includes("ANALYTICS_TRACKING_CONTRACT_STARTED_AT = '2026-08-17T00:00:00.000Z'") && analyticsIntegrity.includes('CURRENT_TRACKING_ACTIVATION_ISO') && mainSource.includes('currentRequestsWithoutTrackedSubmit') && mainSource.includes('historicalRequestsWithoutTrackedSubmit'));
check('analytics traffic dimensions use page views', mainSource.includes('topRows(pageViewEvents, (event) => event.country_name') && mainSource.includes('topRows(pageViewEvents, (event) => event.device_type') && mainSource.includes('Experience detail opens'));
check('review translation is zero-cost browser-local with no provider endpoint', !fs.existsSync(path.join(root, 'functions/api/public/review-translation.js')) && reviewTranslationClient.includes('globalThis.Translator') && reviewTranslationClient.includes('globalThis.LanguageDetector') && !reviewTranslationClient.includes('fetch('));
check('review translation exposes no cloud translation credential or provider URL', !reviewTranslationClient.includes('GOOGLE_CLOUD_TRANSLATION_API_KEY') && !reviewTranslationClient.includes('translation.googleapis.com') && !repositoryFiles.some((name) => { if (name.replace(/\\/g, '/') === 'tools/security-regression.mjs') return false; try { return fs.statSync(path.join(root, name)).isFile() && /GOOGLE_CLOUD_TRANSLATION_API_KEY|translation\.googleapis\.com/.test(fs.readFileSync(path.join(root, name), 'utf8')); } catch { return false; } }));
check('public booking failures expose safe trace ids', bookingEndpoint.includes("'X-Trace-Id': traceId") && bookingEndpoint.includes('trace_id: traceId') && bookingService.includes('error.traceId = traceId'));
check('system UI is split into feature modules', mainSource.includes("OperationalSafeguardsBanner from './features/admin/OperationalSafeguardsBanner.jsx'") && mainSource.includes("WeeklyReportsAdminPanel from './features/system/WeeklyReportsAdminPanel.jsx'") && safeguardsComponent.includes('admin-operational-chip') && weeklyPanelComponent.includes('weekly-report-table'));
check('legacy unsent-email count is sanitized client-side', operationsService.includes('notifications_historical_excluded') && operationsService.includes('normalized.notifications_not_sent = 0'));
check('canonical analytics summary RPC is protected', analyticsConsolidation.includes('get_admin_analytics_summary') && analyticsConsolidation.includes('security definer') && analyticsConsolidation.includes('revoke all on function public.get_admin_analytics_summary') && analyticsConsolidation.includes('not public.is_admin()'));
check('analytics baseline mutation requires privileged admin', analyticsConsolidation.includes('set_analytics_reporting_baseline') && analyticsConsolidation.includes('clear_analytics_reporting_baseline') && analyticsConsolidation.includes('not public.is_privileged_admin()'));
check('analytics baseline is non-destructive', !/truncate\s+(table\s+)?public\.(analytics_events|analytics_sessions)/i.test(analyticsConsolidation) && !/delete\s+from\s+public\.(analytics_events|analytics_sessions)/i.test(analyticsConsolidation));
check('analytics raw reads are paginated', analyticsService.includes('.range(offset, offset + pageSize - 1)') && analyticsService.includes("count: 'exact'"));
check('weekly recap consumes canonical analytics RPC', recapFunction.includes("rpc/get_admin_analytics_summary") && !recapFunction.includes("list('analytics_events'"));
check('session lifecycle is stored outside behavioral event stream', analyticsIngestion.includes('SESSION_LIFECYCLE_EVENTS') && analyticsIngestion.includes('!SESSION_LIFECYCLE_EVENTS.has(payload.event_name)'));
check('analytics owner browser opt-out exists', analytics.includes('vulcaniq_analytics_opt_out') && analytics.includes('setAnalyticsBrowserExcluded'));
check('optional analytics requires explicit positive browser preference', analytics.includes('analyticsConsentGranted()') && privacyPreferenceService.includes("typeof analytics !== 'boolean'") && privacyPreferenceUi.includes('Reject analytics') && privacyPreferenceUi.includes('Accept analytics'));
check('analytics preference remains separate from PWA and notification permission', privacyPreferenceUi.includes('Installation, notifications and requests do not depend on analytics.') && !privacyPreferenceService.includes('Notification.requestPermission') && !privacyPreferenceService.includes('promptInstall'));
check('analytics strips free-form attribution detail', ['heard_about_us_detail', 'heard_about_us_display'].every((key) => analytics.includes(`'${key}'`) && analyticsIngestion.includes(`'${key}'`)));
check('analytics consolidation migration has one transaction boundary', (analyticsConsolidation.match(/^begin;$/gm) || []).length === 1 && (analyticsConsolidation.match(/^commit;$/gm) || []).length === 1);


check('Google review cache has RLS and no direct browser table grants', premodernMigration.includes('alter table public.google_reviews_cache enable row level security') && premodernMigration.includes('revoke all on public.google_reviews_cache from public, anon, authenticated'));
check('Google public review RPC is narrow and hardened', premodernMigration.includes('get_public_google_reviews') && premodernMigration.includes('security definer') && premodernMigration.includes('set search_path = public, pg_temp') && premodernMigration.includes('expires_at > now()'));
check('Google sync manual action requires admin and rate limiting', googleReviewsSync.includes('requireAdmin(req)') && googleReviewsSync.includes("claimAdminAction('google-reviews-sync-manual'"));
check('Google sync cron requires dedicated server secret', googleReviewsSync.includes('GOOGLE_REVIEWS_SYNC_SECRET') && googleReviewsSync.includes('x-vulcaniq-google-reviews-sync-secret'));
check('Google OAuth credentials remain server-only', googleBusinessShared.includes('GOOGLE_BUSINESS_CLIENT_SECRET') && googleBusinessShared.includes('GOOGLE_BUSINESS_REFRESH_TOKEN') && !googleReviewsClient.includes('GOOGLE_BUSINESS_CLIENT_SECRET') && !googleReviewsClient.includes('GOOGLE_BUSINESS_REFRESH_TOKEN'));
check('analytics session mutation is service-role-only', premodernMigration.includes('upsert_analytics_session') && premodernMigration.includes('revoke all on function public.upsert_analytics_session') && premodernMigration.includes('to service_role'));
check('analytics session upsert is monotonic', ['greatest(public.analytics_sessions.last_seen_at, excluded.last_seen_at)', 'greatest(public.analytics_sessions.duration_seconds, excluded.duration_seconds)', 'greatest(public.analytics_sessions.pageview_count, excluded.pageview_count)'].every((value) => premodernMigration.includes(value)));
check('premodernization migration has one transaction boundary', (premodernMigration.match(/^begin;$/gm) || []).length === 1 && (premodernMigration.match(/^commit;$/gm) || []).length === 1);
check('security headers add browser hardening without enforced CSP rollout', securityHeaders.includes('X-Content-Type-Options: nosniff') && securityHeaders.includes('Referrer-Policy: strict-origin-when-cross-origin') && securityHeaders.includes('Content-Security-Policy-Report-Only:') && !/^\s*Content-Security-Policy:/m.test(securityHeaders));
check('admin routes carry noindex response header', /\/admin\/\*[\s\S]*X-Robots-Tag: noindex, nofollow/.test(securityHeaders));
check('no Google provider secret is exposed through VITE variables', !fs.readdirSync(root, { recursive: true }).filter((name) => typeof name === 'string' && !name.startsWith('.git/') && !name.includes('node_modules/')).some((name) => { try { return fs.statSync(path.join(root, name)).isFile() && /VITE_[A-Z0-9_]*GOOGLE_BUSINESS_(CLIENT_SECRET|REFRESH_TOKEN)/i.test(fs.readFileSync(path.join(root, name), 'utf8')); } catch { return false; } }));

check('immediate operational emails use branded responsive template', notifyFunction.includes('buildRequestNotificationEmail') && requestNotificationEmail.includes('VULCANIQ · OPERATIONS') && requestNotificationEmail.includes('@media(max-width:620px)') && requestNotificationEmail.includes('replyTo'));
check('immediate operational notifications use source-aware trusted ingest', notifyFunction.includes('ingestAdminNotification') && notifyFunction.includes('NOTIFICATION_INGEST_SECRET') && notifyFunction.includes("source === 'website'") && notifyFunction.includes("source === 'booking_code'") && !notifyFunction.includes('customer_name:'));
check('authenticated immediate-email retry CORS is origin-restricted', notifyFunction.includes('REQUEST_NOTIFICATION_ALLOWED_ORIGINS') && !notifyFunction.includes("'Access-Control-Allow-Origin': '*'"));
check('payment semantics migration is forward-only transactional and privileged', (paymentFinanceMigration.match(/^begin;$/gm) || []).length === 1 && (paymentFinanceMigration.match(/^commit;$/gm) || []).length === 1 && paymentFinanceMigration.includes('if not public.is_privileged_admin()') && paymentFinanceMigration.includes('if not public.is_admin()'));
check('Gift Card Issued does not recognize revenue', (() => { const block = paymentFinanceMigration.slice(paymentFinanceMigration.indexOf("if next_status = 'issued'"), paymentFinanceMigration.indexOf("elsif next_status = 'cancelled'")); return block && !/insert into public\.finance_entries/i.test(block); })());
check('refund RPC is transactional, authorized, and preserves original entry', (financeRefundMigration.match(/^begin;$/gm) || []).length === 1 && (financeRefundMigration.match(/^commit;$/gm) || []).length === 1 && financeRefundMigration.includes('if not public.is_admin()') && financeRefundMigration.includes('reversal_of') && !/delete\s+from\s+public\.finance_entries/i.test(financeRefundMigration));
check('notification API keeps backend Supabase and VAPID private material server-side', notificationApi.includes('resolveSupabaseBackendCredential') && !notificationService.includes('SUPABASE_SECRET_KEY') && !notificationService.includes('SUPABASE_SERVICE_ROLE_KEY') && !notificationService.includes('VAPID_PRIVATE_KEY'));
check('notification API enforces trusted CORS and admin authorization', notificationApi.includes('trustedOrigin') && notificationApi.includes('admin_profiles') && notificationApi.includes('requireAdmin') && !notificationApi.includes("'Access-Control-Allow-Origin': '*'"));
check('notification Worker degrades dead push subscriptions to in-app delivery', notificationWorker.includes('p256dh=NULL,auth=NULL,enabled=1') && notificationWorker.includes('inapp://${event.audience}'));
check('trusted Cloudflare Supabase consumers share Secret-compatible backend headers', [notificationApi, notificationWorker, publicApiShared, analyticsIngestion, backupShared].every((source) => source.includes('resolveSupabaseBackendCredential') && source.includes('supabaseBackendHeaders')));
check('public API keeps rate limits and server-authoritative RPC boundaries with new credential model', publicApiShared.includes('claim_public_submission_rate_limit') && publicApiShared.includes('supabaseRpc') && bookingEndpoint.includes('create_public_booking_request') && giftEndpoint.includes('create_public_gift_card_request'));
check('analytics actor continuity remains independent of the preferred Secret key', analyticsIngestion.includes("env.SUBMISSION_HASH_SALT || env.SUPABASE_SERVICE_ROLE_KEY || 'analytics'") && publicApiShared.includes("env.SUBMISSION_HASH_SALT || env.SUPABASE_SERVICE_ROLE_KEY || 'vulcaniq-public-endpoint'"));
check('backup and restore support Secret key primary with legacy fallback', storageExport.includes('resolveSupabaseBackendCredential(process.env)') && storageExport.includes('secretCompatibleFetch') && storageRestore.includes('process.env.SUPABASE_SECRET_KEY') && storageRestore.includes('USE_LEGACY_BEARER') && backupWorkflow.includes('SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}') && backupWorkflow.includes('SUPABASE_SECRET_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-}'));
check('Supabase Edge Functions support deterministic named Secret maps without replacing user bearer auth', edgeFunctionShared.includes("env('SUPABASE_SECRET_KEYS', false)") && edgeFunctionShared.includes("env('SUPABASE_SECRET_KEY_NAME', false)") && edgeFunctionShared.includes("env('SUPABASE_SERVICE_ROLE_KEY')") && edgeFunctionShared.includes('authorization: auth') && edgeSecretKeyHelper.includes("requestedName || 'default'") && !edgeSecretKeyHelper.includes('Object.values'));
check('Financial Audit authorization is enforced on the backend', financeAuditEndpoint.includes('/auth/v1/user') && financeAuditEndpoint.includes('/rest/v1/admin_profiles') && financeAuditEndpoint.includes("new Set(['owner', 'finance'])") && financeAuditEndpoint.includes('finance_audit_permission_denied'));
check('Financial Audit browser code contains no service-role capability', !financeAuditService.includes('SERVICE_ROLE') && !financeAuditService.includes('serviceRole') && !financeAuditEndpoint.includes('SUPABASE_SERVICE_ROLE_KEY'));
check('Financial Audit minimizes PII and neutralizes CSV formulas', financeAuditEndpoint.includes("piiIncluded:false") && financeAuditEndpoint.includes("/^[\\s]*[=+\\-@]/") && !/customer_email|customer_phone|buyer_email|buyer_phone/.test(financeAuditEndpoint));
check('Financial Audit generation is logged before export response', financeAuditEndpoint.indexOf('await logAudit(') < financeAuditEndpoint.indexOf("if (format === 'csv')"));
check('activity_log grants and RLS authorize active owner/finance bearer callers', privilegeReconciliation.includes('grant select, insert on table public.activity_log to authenticated;') && bootstrapFoundation.includes('create policy "Admins can insert activity log"') && bootstrapFoundation.includes('with check (public.is_admin());') && revenueFollowup.includes('ap.user_id = auth.uid()') && revenueFollowup.includes('ap.active = true') && revenueFollowup.includes("'owner', 'manager', 'guide', 'finance', 'content_editor'"));
check('Financial Audit logs the caller identity with the caller bearer token', financeAuditEndpoint.includes("supabaseFetch(settings, token, '/rest/v1/activity_log'") && financeAuditEndpoint.includes('actor_id: userId') && financeAuditEndpoint.includes('logAudit(auth.settings,auth.token,auth.user.id,auditId,metadata)'));
check('security headers include HSTS and CSP remains report-only', securityHeaders.includes('Strict-Transport-Security: max-age=31536000') && securityHeaders.includes('Content-Security-Policy-Report-Only:') && !/^\s*Content-Security-Policy:/m.test(securityHeaders));
check('Terms work remains design-only without fabricated participant or acceptance schema', termsArchitecture.includes('design only') && termsArchitecture.includes('no canonical participant row') && termsArchitecture.includes('No migration file is created in this branch.') && !repositoryFiles.some((name) => /supabase[\\/]migrations[\\/].*(terms_acceptances|booking_participants)/i.test(name)));
check('deferred legal design keeps evidence immutable, versioned, represented and transaction scoped', ['terms_versions', 'terms_acceptances', 'append-only', 'accepted_by_parent_or_guardian', 'accepted_by_booking_organizer', 'transaction type/reference'].every((token) => termsArchitecture.includes(token)));
check('deferred legal design does not infer acceptance from identifiers or notification state', ['name, email, phone, booking-code possession, PWA install, push permission, or notification ownership', 'cannot silently accept for a later recipient', 'never broadcast when ownership is absent'].every((token) => termsArchitecture.includes(token)));

for (const name of passes) console.log(`PASS  ${name}`);
for (const name of failures) console.error(`FAIL  ${name}`);
console.log(`\n${passes.length} passed, ${failures.length} failed.`);
if (failures.length) process.exit(1);

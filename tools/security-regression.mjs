import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const passes = [];

function check(name, condition, detail = '') {
  if (condition) passes.push(name);
  else failures.push(`${name}${detail ? `: ${detail}` : ''}`);
}

const packageJson = JSON.parse(read('package.json'));
const migration = read('supabase/migrations/20260726_automation_notifications_weekly_security.sql');
const storageMigration = read('supabase/migrations/20260726_storage_security_hardening.sql');
const bookingService = read('src/services/bookingRequests.js');
const giftService = read('src/services/giftCards.js');
const bookingEndpoint = read('functions/api/public/booking-request.js');
const giftEndpoint = read('functions/api/public/gift-card-request.js');
const analytics = read('src/analytics.js');
const backupShared = read('functions/api/admin/backup/_shared.js');
const backupCreate = read('functions/api/admin/backup/create.js');
const notifyFunction = read('supabase/functions/notify-new-request/index.ts');
const recapFunction = read('supabase/functions/send-weekly-admin-recap/index.ts');
const followupMigration = read('supabase/migrations/20260817_operational_analytics_reporting_fix.sql');
const weeklyEmail = read('supabase/functions/_shared/weeklyRecapEmail.ts');
const operationsService = read('src/services/operationsService.js');
const mainSource = read('src/main.jsx');
const analyticsIntegrity = read('src/features/analytics/integrity.js');
const analyticsContract = read('src/features/analytics/contract.js');
const analyticsConsolidation = read('supabase/migrations/20260818_analytics_consolidation.sql');
const analyticsService = read('src/services/analyticsService.js');
const analyticsIngestion = read('functions/api/analytics/event.js');
const safeguardsComponent = read('src/features/admin/OperationalSafeguardsBanner.jsx');
const weeklyPanelComponent = read('src/features/system/WeeklyReportsAdminPanel.jsx');

check('jose dependency pinned', packageJson.dependencies?.jose === '5.9.6');
check('GitHub App credentials supported', ['GITHUB_APP_ID', 'GITHUB_APP_INSTALLATION_ID', 'GITHUB_APP_PRIVATE_KEY'].every((key) => backupShared.includes(key)));
check('GitHub App preferred with temporary PAT fallback', backupShared.includes('legacy_pat') && backupShared.includes('github_app'));
check('backup endpoint validates JSON/body size', backupCreate.includes('readRequestJsonWithinLimit') && backupCreate.includes('requestHasJsonContentType'));
check('backup endpoint is rate limited', backupCreate.includes('claimAdminActionRateLimit'));
const publicBookingSection = bookingService.slice(bookingService.indexOf('export async function createPublicBookingRequest'), bookingService.indexOf('export async function createManualBookingRequest'));
check('public booking uses server endpoint', publicBookingSection.includes("fetch('/api/public/booking-request'") && !publicBookingSection.includes(".from('booking_requests')"));
check('public Gift Card uses server endpoint', giftService.includes("fetch('/api/public/gift-card-request'") && !giftService.includes(".from('gift_card_requests')\n    .insert"));
check('public endpoints require idempotency', bookingEndpoint.includes('idempotencyKey') && giftEndpoint.includes('idempotencyKey'));
check('public endpoints apply rate limiting', bookingEndpoint.includes('claimPublicRateLimit') && giftEndpoint.includes('claimPublicRateLimit'));
check('public endpoints support Turnstile', bookingEndpoint.includes('verifyTurnstile') && giftEndpoint.includes('verifyTurnstile'));
check('public booking cannot set partner authority', !bookingEndpoint.includes('partner_id:') && !bookingEndpoint.includes('partner_source_assigned_by:'));
check('server RPC ignores public partner authority', !migration.match(/request_payload->>'partner_id'/) && !migration.match(/request_payload->>'partner_source_assigned_by'/));
check('direct anonymous operational inserts revoked', migration.includes('revoke insert on public.booking_requests from anon') && migration.includes('revoke insert on public.gift_card_requests from anon'));
check('analytics direct inserts revoked', migration.includes('revoke insert on public.analytics_events from anon, authenticated'));
check('private operational tables have RLS', ['request_notification_log', 'admin_weekly_reports', 'endpoint_rate_limits'].every((table) => migration.includes(`alter table public.${table} enable row level security`)));
check('no globally permissive policy in new migrations', !/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i.test(`${migration}\n${storageMigration}\n${analyticsConsolidation}`));
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
check('weekly recap manual send is throttled', recapFunction.includes("claimAdminAction('weekly-recap-manual'"));
check('weekly recap rejects an empty recipient list', recapFunction.includes("if (!targets.length) throw new Error('no_weekly_recap_recipients')"));
check('migration has one transaction boundary', (migration.match(/^begin;$/gm) || []).length === 1 && (migration.match(/^commit;$/gm) || []).length === 1);
check('Gift Card RPC has no duplicate declaration', !migration.includes('inserted public.gift_card_requests%rowtype;\n  inserted public.gift_card_requests%rowtype;'));
const repositoryFiles = fs.readdirSync(root, { recursive: true })
  .filter((name) => typeof name === 'string' && !name.startsWith('.git/') && !name.includes('node_modules/'));
const keyFiles = repositoryFiles.filter((name) => /(^|\/)(?!.*example)([^/]+\.(pem|key)|id_rsa)$/i.test(name));
check('private key material is not committed', keyFiles.length === 0, keyFiles.join(', '));
check('no service-role VITE variable', !fs.readdirSync(root, { recursive: true }).filter((name) => typeof name === 'string' && !name.startsWith('.git/') && !name.includes('node_modules/')).some((name) => {
  try { return fs.statSync(path.join(root, name)).isFile() && /VITE_[A-Z0-9_]*SERVICE_ROLE/i.test(fs.readFileSync(path.join(root, name), 'utf8')); } catch { return false; }
}));

check('weekly recap uses branded email template', recapFunction.includes('buildWeeklyRecapEmail') && weeklyEmail.includes('VULCANIQ · OPERATIONS') && weeklyEmail.includes('Executive overview'));
check('weekly recap separates conversion families', ['Website booking funnel', 'Fast Request / WhatsApp', 'Booking-code funnel', 'Gift Card funnel', 'Gift Card status'].every((value) => weeklyEmail.includes(value)) && recapFunction.includes('rpc/get_admin_analytics_summary'));
check('operational safeguards exclude historical not-sent rows', followupMigration.includes("'safeguard_version', 2") && followupMigration.includes('notifications_historical_excluded') && followupMigration.includes("source = 'website'"));
check('public RPC extension search path is explicit', ['create_public_booking_request(jsonb)', 'create_public_gift_card_request(jsonb)', 'admin_update_gift_card_request(uuid, jsonb)'].every((signature) => followupMigration.includes(`alter function public.${signature}`)) && followupMigration.includes('public, extensions, pg_temp'));
check('analytics distinguishes current tracking from history', analyticsContract.includes("ANALYTICS_TRACKING_CONTRACT_STARTED_AT = '2026-08-17T00:00:00.000Z'") && analyticsIntegrity.includes('CURRENT_TRACKING_ACTIVATION_ISO') && mainSource.includes('currentRequestsWithoutTrackedSubmit') && mainSource.includes('historicalRequestsWithoutTrackedSubmit'));
check('analytics traffic dimensions use page views', mainSource.includes('topRows(pageViewEvents, (event) => event.country_name') && mainSource.includes('topRows(pageViewEvents, (event) => event.device_type') && mainSource.includes('Experience detail opens'));
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
check('analytics strips free-form attribution detail', ['heard_about_us_detail', 'heard_about_us_display'].every((key) => analytics.includes(`'${key}'`) && analyticsIngestion.includes(`'${key}'`)));
check('analytics consolidation migration has one transaction boundary', (analyticsConsolidation.match(/^begin;$/gm) || []).length === 1 && (analyticsConsolidation.match(/^commit;$/gm) || []).length === 1);


for (const name of passes) console.log(`PASS  ${name}`);
for (const name of failures) console.error(`FAIL  ${name}`);
console.log(`\n${passes.length} passed, ${failures.length} failed.`);
if (failures.length) process.exit(1);

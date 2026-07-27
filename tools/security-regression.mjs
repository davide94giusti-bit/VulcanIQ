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
check('no globally permissive policy in new migrations', !/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i.test(`${migration}\n${storageMigration}`));
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

for (const name of passes) console.log(`PASS  ${name}`);
for (const name of failures) console.error(`FAIL  ${name}`);
console.log(`\n${passes.length} passed, ${failures.length} failed.`);
if (failures.length) process.exit(1);

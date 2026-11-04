import { claimAdminAction, corsPreflight, dbJson, env, json, requireAdmin } from '../_shared/vulcaniq.ts';
import { drainAdminNotificationHandoffs } from '../_shared/adminHandoff.js';

// Explicit protected drain; no scheduler is installed or enabled by this release.
Deno.serve(async (request) => {
  const preflight = corsPreflight(request);
  if (preflight) return preflight;
  if (request.method !== 'POST') return json(405, { ok: false, code: 'method_not_allowed' });
  try {
    const actor = await requireAdmin(request);
    if (!await claimAdminAction('admin-notification-drain', actor, 3, 300)) return json(429, { ok: false, code: 'rate_limited' });
    const result = await drainAdminNotificationHandoffs({ dbJson, endpoint: env('NOTIFICATION_INGEST_URL', false), secret: env('NOTIFICATION_INGEST_SECRET', false) });
    return json(result.configured ? 200 : 503, { ok: result.configured, ...result });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return json(code === 'unauthorized' ? 401 : code === 'forbidden' ? 403 : 503, { ok: false, code: ['unauthorized','forbidden'].includes(code) ? code : 'handoff_unavailable' });
  }
});

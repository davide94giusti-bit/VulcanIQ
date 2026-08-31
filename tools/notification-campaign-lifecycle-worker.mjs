import { processCampaigns } from '../workers/notifications/src/index.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== 'POST' || url.pathname !== '/process-campaigns') {
      return new Response('Not found', { status: 404 });
    }

    if (!env.NOTIFICATIONS_DB) {
      return Response.json(
        { ok: false, error: 'notifications_db_not_configured' },
        { status: 500 },
      );
    }

    await processCampaigns(env.NOTIFICATIONS_DB, env);

    return Response.json({ ok: true });
  },
};

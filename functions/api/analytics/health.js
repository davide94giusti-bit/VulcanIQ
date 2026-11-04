import { requireActiveOwner } from '../admin/backup/_shared.js';
import { supabaseRequest } from '../public/_shared.js';

export async function onRequestGet(context) {
  const owner = await requireActiveOwner(context.request, context.env, 'en');
  if (!owner.ok) return owner.response;
  const started = Date.now();
  try {
    const response = await supabaseRequest(context.env, 'analytics_events?select=occurred_at&order=occurred_at.desc&limit=1', { method: 'GET' });
    if (!response.ok) throw new Error('analytics_backend_unavailable');
    const rows = await response.json();
    return Response.json({ ok: true, checked_at: new Date().toISOString(), latency_ms: Date.now() - started, latest_event_at: rows[0]?.occurred_at || null, scope: 'database_read_only_not_end_to_end_ingestion' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false, code: 'analytics_backend_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

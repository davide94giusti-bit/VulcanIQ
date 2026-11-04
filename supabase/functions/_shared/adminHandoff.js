export async function drainAdminNotificationHandoffs({ dbJson, endpoint, secret, fetchImpl = fetch }) {
  if (!endpoint || !secret) return { accepted: 0, pending: true, configured: false };
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid_admin_ingest_configuration');
  const rpc = (name, payload) => dbJson(`rpc/${name}`, { method: 'POST', body: JSON.stringify(payload) });
  const rows = await rpc('claim_admin_notification_handoffs', { p_limit: 10 });
  let accepted = 0;
  for (const row of rows || []) {
    if (!await rpc('validate_admin_notification_handoff', { p_key: row.dedupe_key, p_attempt: row.attempt_token })) continue;
    let ok = false;
    try {
      const response = await fetchImpl(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json', 'X-Notification-Ingest-Key': secret }, body: JSON.stringify({ category: row.category, destinationUrl: row.destination, dedupeKey: row.dedupe_key }) });
      // A duplicate receipt must be explicitly acknowledged by the authenticated D1 endpoint.
      const result = await response.json().catch(() => null);
      ok = response.ok && result?.ok === true;
    } catch { /* A stable D1 ingestion key permits retry without replaying email. */ }
    const persisted = await rpc('finish_admin_notification_handoff', { p_key: row.dedupe_key, p_attempt: row.attempt_token, p_accepted: ok });
    if (ok && persisted) accepted++;
  }
  return { accepted, pending: accepted < (rows || []).length, configured: true };
}

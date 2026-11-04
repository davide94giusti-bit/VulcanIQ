export async function deliveryKey(value) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function deliverOperationalEmail({ dbJson, send, key, input }) {
  const p_key = await deliveryKey(key);
  const rpc = (name, args) => dbJson(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
  const claim = await rpc('claim_operational_email', { p_key });
  if (!claim?.attempt_token) return { status: claim?.status || 'unknown', skipped: true };
  const p_attempt = claim.attempt_token;
  if (!await rpc('start_operational_email', { p_key, p_attempt })) return { status: 'unknown', skipped: true };
  let providerId;
  try { providerId = await send({ ...input, idempotencyKey: `vulcaniq-${p_key}` }); }
  catch (error) {
    const status = error?.message === 'email_delivery_rejected' ? 'rejected' : 'unknown';
    await rpc('finish_operational_email', { p_key, p_attempt, p_status: status, p_provider_id: null }).catch(() => null);
    return { status };
  }
  try {
    if (!await rpc('finish_operational_email', { p_key, p_attempt, p_status: 'accepted', p_provider_id: providerId })) return { status: 'unknown' };
  } catch { return { status: 'unknown' }; }
  return { status: 'accepted', providerId };
}

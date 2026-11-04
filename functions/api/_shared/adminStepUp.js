// Call only AFTER Supabase /auth/v1/user accepted the same bearer token.
// Refresh-issued iat is not proof of recent authentication; require a recent MFA AMR.
export function verifiedAdminStepUp(token, verifiedUserId, env = {}, now = Date.now()) {
  if (env.ADMIN_STEP_UP_ENFORCE !== 'true') return { ok: true, enforced: false };
  try {
    const part = String(token).split('.')[1];
    const claims = JSON.parse(atob(part.replaceAll('-', '+').replaceAll('_', '/')));
    if (claims.sub !== verifiedUserId || claims.aal !== 'aal2') return { ok: false, code: 'mfa_required' };
    const recent = (Array.isArray(claims.amr) ? claims.amr : []).some((entry) => ['totp', 'mfa/totp', 'phone', 'mfa/phone', 'webauthn', 'mfa/webauthn'].includes(entry.method)
      && Number.isFinite(entry.timestamp) && entry.timestamp * 1000 <= now + 60000 && entry.timestamp * 1000 >= now - 15 * 60000);
    return recent ? { ok: true, enforced: true } : { ok: false, code: 'recent_mfa_required' };
  } catch { return { ok: false, code: 'mfa_required' }; }
}

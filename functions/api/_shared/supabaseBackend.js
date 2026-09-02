export function isSupabaseSecretKey(value) {
  return /^sb_secret_[A-Za-z0-9_-]+$/.test(String(value || '').trim());
}

export function resolveSupabaseBackendCredential(env = {}) {
  const secretKey = String(env.SUPABASE_SECRET_KEY || '').trim();
  if (secretKey) {
    if (!isSupabaseSecretKey(secretKey)) throw new Error('invalid_supabase_secret_key');
    return { key: secretKey, kind: 'secret', source: 'SUPABASE_SECRET_KEY' };
  }

  const legacyKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!legacyKey) return null;
  return { key: legacyKey, kind: 'legacy_service_role', source: 'SUPABASE_SERVICE_ROLE_KEY' };
}

export function supabaseBackendHeaders(credential, options = {}) {
  if (!credential?.key) throw new Error('supabase_backend_credential_required');
  const userAccessToken = String(options.userAccessToken || '').trim();
  const extraHeaders = new Headers(options.headers || {});
  if (extraHeaders.has('apikey') || extraHeaders.has('authorization')) {
    throw new Error('supabase_auth_header_override_forbidden');
  }
  return {
    ...Object.fromEntries(extraHeaders.entries()),
    apikey: credential.key,
    ...(userAccessToken
      ? { Authorization: `Bearer ${userAccessToken}` }
      : credential.kind === 'legacy_service_role'
        ? { Authorization: `Bearer ${credential.key}` }
        : {})
  };
}

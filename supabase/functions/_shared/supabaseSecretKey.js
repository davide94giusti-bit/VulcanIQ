const SECRET_KEY_PATTERN = /^sb_secret_[A-Za-z0-9_-]+$/;

function validSecretKey(value) {
  return SECRET_KEY_PATTERN.test(String(value || '').trim());
}

export function resolveSupabaseEdgeSecretKey({ explicitKey = '', serializedKeys = '', keyName = '' } = {}) {
  const explicit = String(explicitKey || '').trim();
  if (explicit) {
    if (!validSecretKey(explicit)) throw new Error('invalid_supabase_secret_key');
    return explicit;
  }

  const requestedName = String(keyName || '').trim();
  const serialized = String(serializedKeys || '').trim();
  if (!serialized) {
    if (requestedName) throw new Error('missing_supabase_secret_key_name');
    return null;
  }

  let keys;
  try {
    keys = JSON.parse(serialized);
  } catch {
    throw new Error('invalid_supabase_secret_keys');
  }
  if (!keys || Array.isArray(keys) || typeof keys !== 'object') throw new Error('invalid_supabase_secret_keys');

  const selectedName = requestedName || 'default';
  if (!Object.prototype.hasOwnProperty.call(keys, selectedName)) throw new Error('missing_supabase_secret_key_name');
  const selected = String(keys[selectedName] || '').trim();
  if (!validSecretKey(selected)) throw new Error('invalid_supabase_secret_key_name');
  return selected;
}

import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

export const ADMIN_ROLES = ['owner', 'manager', 'guide', 'finance', 'content_editor'];

const fields = 'user_id, email, full_name, role, active, last_seen_at, created_at, updated_at';

export async function listAdminUsers() {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase
    .from('admin_profiles')
    .select(fields)
    .order('role', { ascending: true })
    .order('full_name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function updateAdminUser(userId, changes = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const payload = {};
  if (Object.prototype.hasOwnProperty.call(changes, 'role') && ADMIN_ROLES.includes(changes.role)) payload.role = changes.role;
  if (Object.prototype.hasOwnProperty.call(changes, 'active')) payload.active = Boolean(changes.active);
  if (Object.prototype.hasOwnProperty.call(changes, 'full_name')) payload.full_name = String(changes.full_name || '').trim() || null;
  if (Object.prototype.hasOwnProperty.call(changes, 'email')) payload.email = String(changes.email || '').trim() || null;
  payload.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('admin_profiles')
    .update(payload)
    .eq('user_id', userId)
    .select(fields)
    .single();
  if (error) throw error;
  return data;
}

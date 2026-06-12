import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

export async function signInOwner({ email, password }) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOutOwner() {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentSession() {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getActiveAdminProfile(userId) {
  if (!isSupabaseConfigured || !userId) return null;

  const { data, error } = await supabase
    .from('admin_profiles')
    .select('id, user_id, full_name, role, active, created_at, updated_at')
    .eq('user_id', userId)
    .eq('active', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

export async function getAdminAccess() {
  const session = await getCurrentSession();
  if (!session?.user) return { session: null, profile: null, isAdmin: false };
  const profile = await getActiveAdminProfile(session.user.id);
  return { session, profile, isAdmin: Boolean(profile?.active) };
}

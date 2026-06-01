import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

function normalize(row) {
  return {
    id: row.id,
    content_key: row.content_key || '',
    section: row.section || '',
    label_it: row.label_it || '',
    label_en: row.label_en || '',
    value_it: row.value_it || '',
    value_en: row.value_en || '',
    default_it: row.default_it || '',
    default_en: row.default_en || '',
    content_type: row.content_type || 'text',
    active: row.active !== false,
    updated_by: row.updated_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function loadPublicSiteContent() {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('public_site_content')
    .select('id, content_key, section, label_it, label_en, value_it, value_en, default_it, default_en, content_type, active')
    .order('section', { ascending: true })
    .order('content_key', { ascending: true });
  if (error) throw error;
  return (data || []).map(normalize);
}

export async function listSiteContent({ activeOnly = false } = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  let query = supabase
    .from(activeOnly ? 'public_site_content' : 'site_content')
    .select(activeOnly
      ? 'id, content_key, section, label_it, label_en, value_it, value_en, default_it, default_en, content_type, active'
      : 'id, created_at, updated_at, content_key, section, label_it, label_en, value_it, value_en, default_it, default_en, content_type, active, updated_by')
    .order('section', { ascending: true })
    .order('content_key', { ascending: true });
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalize);
}

export async function upsertSiteContent(input) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const payload = {
    content_key: input.content_key,
    section: input.section || 'general',
    label_it: input.label_it || null,
    label_en: input.label_en || null,
    value_it: input.value_it ?? null,
    value_en: input.value_en ?? null,
    default_it: input.default_it ?? null,
    default_en: input.default_en ?? null,
    content_type: input.content_type || 'text',
    active: input.active !== false,
    updated_by: input.updated_by || null,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase
    .from('site_content')
    .upsert(payload, { onConflict: 'content_key' })
    .select('*')
    .single();
  if (error) throw error;
  return normalize(data);
}

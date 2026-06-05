import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

const PUBLIC_SITE_CONTENT_FULL_COLUMNS = 'id, content_key, section, label_it, label_en, value_it, value_en, default_it, default_en, content_type, style_variant, text_size, text_align, visible, sort_order, image_url, image_alt_it, image_alt_en, image_position, layout_variant, active';
const PUBLIC_SITE_CONTENT_MIN_COLUMNS = 'id, content_key, section, label_it, label_en, value_it, value_en, default_it, default_en, content_type, active';
const SITE_CONTENT_ADMIN_COLUMNS = 'id, created_at, updated_at, content_key, section, label_it, label_en, value_it, value_en, default_it, default_en, content_type, style_variant, text_size, text_align, visible, sort_order, image_url, image_alt_it, image_alt_en, image_position, layout_variant, active, updated_by';

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
    style_variant: row.style_variant || '',
    text_size: row.text_size || 'normal',
    text_align: row.text_align || 'left',
    visible: row.visible !== false,
    sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    image_url: row.image_url || '',
    image_alt_it: row.image_alt_it || '',
    image_alt_en: row.image_alt_en || '',
    image_position: row.image_position || 'center',
    layout_variant: row.layout_variant || 'default',
    active: row.active !== false,
    updated_by: row.updated_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function selectContentRows(table, columns) {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .order('section', { ascending: true })
    .order('content_key', { ascending: true });
  if (error) throw error;
  return (data || []).map(normalize);
}

export async function loadPublicSiteContent() {
  if (!isSupabaseConfigured) return [];

  try {
    return await selectContentRows('public_site_content', PUBLIC_SITE_CONTENT_FULL_COLUMNS);
  } catch (fullViewError) {
    try {
      return await selectContentRows('public_site_content', PUBLIC_SITE_CONTENT_MIN_COLUMNS);
    } catch (minimalViewError) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session) {
        return selectContentRows('site_content', SITE_CONTENT_ADMIN_COLUMNS);
      }
      throw minimalViewError || fullViewError;
    }
  }
}

export async function listSiteContent({ activeOnly = false } = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const table = activeOnly ? 'public_site_content' : 'site_content';
  const columns = activeOnly ? PUBLIC_SITE_CONTENT_FULL_COLUMNS : SITE_CONTENT_ADMIN_COLUMNS;

  try {
    return await selectContentRows(table, columns);
  } catch (error) {
    if (activeOnly) return selectContentRows('public_site_content', PUBLIC_SITE_CONTENT_MIN_COLUMNS);
    throw error;
  }
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
    style_variant: input.style_variant || null,
    text_size: input.text_size || 'normal',
    text_align: input.text_align || 'left',
    visible: input.visible !== false,
    sort_order: Number.isFinite(Number(input.sort_order)) ? Number(input.sort_order) : 0,
    image_url: input.image_url || null,
    image_alt_it: input.image_alt_it || null,
    image_alt_en: input.image_alt_en || null,
    image_position: input.image_position || null,
    layout_variant: input.layout_variant || null,
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

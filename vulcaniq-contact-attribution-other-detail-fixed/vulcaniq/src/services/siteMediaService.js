import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

const PUBLIC_ASSET_BUCKET = 'vulcaniq-public-assets';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf'];
const PUBLIC_SITE_MEDIA_FULL_COLUMNS = 'id, media_key, label_it, label_en, file_url, file_path, file_name, file_type, media_kind, alt_it, alt_en, image_position, image_size, active';
const PUBLIC_SITE_MEDIA_MIN_COLUMNS = 'id, media_key, label_it, label_en, file_url, file_type, media_kind, alt_it, alt_en, active';
const SITE_MEDIA_ADMIN_COLUMNS = 'id, created_at, updated_at, media_key, label_it, label_en, file_url, file_path, file_name, file_type, media_kind, alt_it, alt_en, image_position, image_size, active, updated_by';

function normalize(row) {
  return {
    id: row.id,
    media_key: row.media_key || '',
    label_it: row.label_it || '',
    label_en: row.label_en || '',
    file_url: row.file_url || '',
    file_path: row.file_path || '',
    file_name: row.file_name || '',
    file_type: row.file_type || '',
    media_kind: row.media_kind || 'image',
    alt_it: row.alt_it || '',
    alt_en: row.alt_en || '',
    image_position: row.image_position || 'center',
    image_size: row.image_size || 'normal',
    active: row.active !== false,
    updated_by: row.updated_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function safeFileName(file, fallback = 'site-media') {
  return String(file?.name || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || fallback;
}

async function selectMediaRows(table, columns) {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .order('media_key', { ascending: true });
  if (error) throw error;
  return (data || []).map(normalize);
}

export async function listSiteMedia({ activeOnly = false } = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const table = activeOnly ? 'public_site_media' : 'site_media';
  const columns = activeOnly ? PUBLIC_SITE_MEDIA_FULL_COLUMNS : SITE_MEDIA_ADMIN_COLUMNS;

  try {
    return await selectMediaRows(table, columns);
  } catch (error) {
    if (activeOnly) return selectMediaRows('public_site_media', PUBLIC_SITE_MEDIA_MIN_COLUMNS);
    throw error;
  }
}

export async function upsertSiteMedia(input) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const payload = {
    media_key: input.media_key,
    label_it: input.label_it || null,
    label_en: input.label_en || null,
    file_url: input.file_url || null,
    file_path: input.file_path || null,
    file_name: input.file_name || null,
    file_type: input.file_type || null,
    media_kind: input.media_kind || 'image',
    alt_it: input.alt_it || null,
    alt_en: input.alt_en || null,
    image_position: input.image_position || 'center',
    image_size: input.image_size || 'normal',
    active: input.active !== false,
    updated_by: input.updated_by || null,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase
    .from('site_media')
    .upsert(payload, { onConflict: 'media_key' })
    .select('*')
    .single();
  if (error) throw error;
  return normalize(data);
}

export async function uploadSiteMediaFile(file, key, userId) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  if (!file || !ALLOWED_TYPES.includes(file.type)) throw new Error('Only JPEG, PNG, WEBP, MP4, or PDF files are allowed.');
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `site-media/${key || 'media'}/${userId || 'admin'}/${unique}-${safeFileName(file)}`;
  const { error } = await supabase.storage
    .from(PUBLIC_ASSET_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from(PUBLIC_ASSET_BUCKET).getPublicUrl(path);
  return {
    file_url: data?.publicUrl || '',
    file_path: path,
    file_name: file.name || safeFileName(file),
    file_type: file.type,
    media_kind: file.type.startsWith('video/') ? 'video' : file.type === 'application/pdf' ? 'document' : 'image'
  };
}

export async function removeSiteMediaFile(path) {
  if (!isSupabaseConfigured || !path) return;
  await supabase.storage.from(PUBLIC_ASSET_BUCKET).remove([path]);
}

import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

function normalizePartnership(row) {
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    name: row.name || '',
    description_it: row.description_it || '',
    description_en: row.description_en || '',
    website_url: row.website_url || '',
    image_url: row.image_url || '',
    category_it: row.category_it || '',
    category_en: row.category_en || '',
    active: row.active !== false,
    display_order: Number(row.display_order || 0),
    created_by: row.created_by || null,
    updated_by: row.updated_by || null
  };
}

function cleanPayload(input) {
  const payload = {
    name: input.name?.trim(),
    description_it: input.description_it || null,
    description_en: input.description_en || null,
    website_url: input.website_url || null,
    image_url: input.image_url || null,
    category_it: input.category_it || null,
    category_en: input.category_en || null,
    display_order: Number.parseInt(input.display_order || 0, 10) || 0,
    active: input.active !== false,
    created_by: input.created_by || null,
    updated_by: input.updated_by || null
  };
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
  return payload;
}

export async function loadPublicPartnerships() {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('public_partnerships')
      .select('id, name, description_it, description_en, website_url, image_url, category_it, category_en, active, display_order')
      .eq('active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;
    return Array.isArray(data) ? data.map(normalizePartnership) : [];
  } catch (error) {
    console.warn('Supabase partnerships unavailable.', error?.message || error);
    return [];
  }
}

export async function listPartnerships({ activeOnly = false } = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  let query = supabase
    .from('partnerships')
    .select('id, created_at, updated_at, name, description_it, description_en, website_url, image_url, category_it, category_en, active, display_order, created_by, updated_by')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (activeOnly) query = query.eq('active', true);

  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data.map(normalizePartnership) : [];
}

export async function createPartnership(input) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const payload = cleanPayload(input);
  if (!payload.name) throw new Error('Name is required.');

  const { data, error } = await supabase
    .from('partnerships')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return normalizePartnership(data);
}

export async function updatePartnership(id, input) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const payload = { ...cleanPayload(input), updated_at: new Date().toISOString() };
  delete payload.created_by;
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);

  const { data, error } = await supabase
    .from('partnerships')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return normalizePartnership(data);
}

export async function deactivatePartnership(id, userId) {
  return updatePartnership(id, { active: false, updated_by: userId || null });
}

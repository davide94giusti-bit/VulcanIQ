import { blockedDates } from '../data/availability.js';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

function normalizeAvailabilityRow(row) {
  return {
    id: row.id,
    date: row.date,
    status: row.status,
    experience: row.experience_id || undefined,
    experience_id: row.experience_id || null,
    active: row.active !== false,
    reason: {
      it: row.reason_it || '',
      en: row.reason_en || ''
    },
    reason_it: row.reason_it || '',
    reason_en: row.reason_en || '',
    source: 'supabase'
  };
}

export async function loadPublicAvailability() {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('public_availability_blocks')
        .select('id, date, status, experience_id, reason_it, reason_en, active')
        .eq('active', true)
        .order('date', { ascending: true });

      if (error) throw error;
      if (Array.isArray(data)) return data.map(normalizeAvailabilityRow);
    } catch (error) {
      console.warn('Supabase availability unavailable, using fallback availability.', error?.message || error);
    }
  }

  try {
    const response = await fetch('/availability.json', { cache: 'no-store' });
    if (response.ok) {
      const json = await response.json();
      if (Array.isArray(json)) return json;
    }
  } catch (error) {
    console.warn('Runtime availability JSON unavailable, using local fallback.', error?.message || error);
  }

  return blockedDates;
}

export async function listAvailabilityBlocks({ activeOnly = false, fromDate = null, toDate = null } = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  let query = supabase
    .from('availability_blocks')
    .select('id, created_at, updated_at, date, status, experience_id, reason_it, reason_en, internal_note, created_by, updated_by, booking_request_id, active')
    .order('date', { ascending: true })
    .order('created_at', { ascending: false });

  if (activeOnly) query = query.eq('active', true);
  if (fromDate) query = query.gte('date', fromDate);
  if (toDate) query = query.lte('date', toDate);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createAvailabilityBlock(input) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const payload = {
    date: input.date,
    status: input.status,
    experience_id: input.experience_id || null,
    reason_it: input.reason_it || defaultReason(input.status, 'it'),
    reason_en: input.reason_en || defaultReason(input.status, 'en'),
    internal_note: input.internal_note || null,
    created_by: input.created_by || null,
    updated_by: input.updated_by || null,
    booking_request_id: input.booking_request_id || null,
    active: input.active !== false
  };

  const { data, error } = await supabase
    .from('availability_blocks')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function updateAvailabilityBlock(id, input) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const payload = {
    ...input,
    experience_id: input.experience_id === '' ? null : input.experience_id,
    updated_at: new Date().toISOString()
  };

  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);

  const { data, error } = await supabase
    .from('availability_blocks')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function deactivateAvailabilityBlock(id, userId) {
  return updateAvailabilityBlock(id, { active: false, updated_by: userId || null });
}

export function defaultReason(status, lang) {
  const map = {
    closed: { it: 'Non disponibile', en: 'Closed' },
    limited: { it: 'Disponibilità limitata', en: 'Limited availability' },
    'on-request': { it: 'Su richiesta', en: 'On request' }
  };
  return map[status]?.[lang] || '';
}

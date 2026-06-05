import { blockedDates } from '../data/availability.js';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

const FIXED_EXCURSION_FILE_BUCKET = 'vulcaniq-public-assets';

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

function normalizeFixedExcursion(row) {
  const capacity = Number(row.capacity || 12);
  const accepted = Number(row.accepted_count || row.accepted_people || 0);
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    date: row.date,
    start_time: row.start_time || '',
    end_time: row.end_time || '',
    experience_id: row.experience_id,
    title_it: row.title_it || '',
    title_en: row.title_en || '',
    description_it: row.description_it || '',
    description_en: row.description_en || '',
    meeting_point_it: row.meeting_point_it || '',
    meeting_point_en: row.meeting_point_en || '',
    difficulty_it: row.difficulty_it || '',
    difficulty_en: row.difficulty_en || '',
    price_note_it: row.price_note_it || '',
    price_note_en: row.price_note_en || '',
    blocked_dates_file_url: row.blocked_dates_file_url || '',
    blocked_dates_file_name: row.blocked_dates_file_name || '',
    blocked_dates_file_type: row.blocked_dates_file_type || '',
    blocked_dates_file_path: row.blocked_dates_file_path || '',
    leaflet_id: row.leaflet_id || null,
    status: row.status || 'available',
    public_visibility: row.public_visibility !== false,
    capacity,
    note_it: row.note_it || row.description_it || '',
    note_en: row.note_en || row.description_en || '',
    active: row.active !== false,
    created_by: row.created_by || null,
    updated_by: row.updated_by || null,
    accepted_count: accepted,
    places_remaining: Math.max(0, Number(row.places_remaining ?? capacity - accepted))
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

export async function loadPublicFixedExcursions() {
  if (!isSupabaseConfigured) return [];
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('public_fixed_excursions')
      .select('id, date, start_time, end_time, experience_id, title_it, title_en, description_it, description_en, meeting_point_it, meeting_point_en, difficulty_it, difficulty_en, price_note_it, price_note_en, blocked_dates_file_url, blocked_dates_file_name, blocked_dates_file_type, blocked_dates_file_path, leaflet_id, status, public_visibility, capacity, note_it, note_en, active, accepted_count, places_remaining')
      .eq('active', true)
      .gte('date', today)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) throw error;
    return Array.isArray(data) ? data.map(normalizeFixedExcursion) : [];
  } catch (error) {
    console.warn('Supabase fixed excursions unavailable.', error?.message || error);
    return [];
  }
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

export async function listFixedExcursions({ activeOnly = false, fromDate = null, toDate = null } = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  let query = supabase
    .from('fixed_excursions')
    .select('id, created_at, updated_at, date, start_time, end_time, experience_id, title_it, title_en, description_it, description_en, meeting_point_it, meeting_point_en, difficulty_it, difficulty_en, price_note_it, price_note_en, blocked_dates_file_url, blocked_dates_file_name, blocked_dates_file_type, blocked_dates_file_path, leaflet_id, status, public_visibility, capacity, note_it, note_en, active, created_by, updated_by')
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });

  if (activeOnly) query = query.eq('active', true);
  if (fromDate) query = query.gte('date', fromDate);
  if (toDate) query = query.lte('date', toDate);

  const { data, error } = await query;
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const ids = rows.map((row) => row.id);
  let counts = {};

  if (ids.length) {
    const { data: acceptedRows, error: countError } = await supabase
      .from('booking_requests')
      .select('fixed_excursion_id, adults, children')
      .eq('request_type', 'fixed')
      .eq('status', 'accepted')
      .in('fixed_excursion_id', ids);

    if (countError) throw countError;
    counts = (acceptedRows || []).reduce((acc, request) => {
      const id = request.fixed_excursion_id;
      acc[id] = (acc[id] || 0) + Number(request.adults || 0) + Number(request.children || 0);
      return acc;
    }, {});
  }

  return rows.map((row) => normalizeFixedExcursion({
    ...row,
    accepted_count: counts[row.id] || 0,
    places_remaining: Number(row.capacity || 12) - (counts[row.id] || 0)
  }));
}

export async function createFixedExcursion(input) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const payload = {
    date: input.date,
    start_time: input.start_time || null,
    end_time: input.end_time || null,
    experience_id: input.experience_id,
    title_it: input.title_it || null,
    title_en: input.title_en || null,
    description_it: input.description_it || input.note_it || null,
    description_en: input.description_en || input.note_en || null,
    meeting_point_it: input.meeting_point_it || null,
    meeting_point_en: input.meeting_point_en || null,
    difficulty_it: input.difficulty_it || null,
    difficulty_en: input.difficulty_en || null,
    price_note_it: input.price_note_it || null,
    price_note_en: input.price_note_en || null,
    blocked_dates_file_url: input.blocked_dates_file_url || null,
    blocked_dates_file_name: input.blocked_dates_file_name || null,
    blocked_dates_file_type: input.blocked_dates_file_type || null,
    blocked_dates_file_path: input.blocked_dates_file_path || null,
    leaflet_id: input.leaflet_id || null,
    status: input.status || 'available',
    public_visibility: input.public_visibility !== false,
    note_it: input.note_it || input.description_it || null,
    note_en: input.note_en || input.description_en || null,
    capacity: Number.parseInt(input.capacity || 12, 10),
    active: input.active !== false,
    created_by: input.created_by || null,
    updated_by: input.updated_by || null
  };

  const { data, error } = await supabase
    .from('fixed_excursions')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function updateFixedExcursion(id, input) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const payload = { ...input, updated_at: new Date().toISOString() };
  if (payload.capacity !== undefined) payload.capacity = Number.parseInt(payload.capacity || 12, 10);
  if (payload.start_time === '') payload.start_time = null;
  if (payload.end_time === '') payload.end_time = null;
  if (payload.description_it && !payload.note_it) payload.note_it = payload.description_it;
  if (payload.description_en && !payload.note_en) payload.note_en = payload.description_en;
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);

  const { data, error } = await supabase
    .from('fixed_excursions')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function deactivateFixedExcursion(id, userId) {
  return updateFixedExcursion(id, { active: false, updated_by: userId || null });
}


export function isAllowedBlockedDatesFile(file) {
  if (!file) return false;
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  return allowed.includes(file.type);
}

export async function uploadBlockedDatesFile(file, userId) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  if (!isAllowedBlockedDatesFile(file)) {
    throw new Error('Only PDF, JPEG, PNG, or WEBP files are allowed.');
  }

  const safeName = String(file.name || 'blocked-dates-file')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'blocked-dates-file';
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `blocked-dates/${userId || 'admin'}/${unique}-${safeName}`;

  const { error } = await supabase.storage
    .from(FIXED_EXCURSION_FILE_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });

  if (error) throw error;

  const { data } = supabase.storage.from(FIXED_EXCURSION_FILE_BUCKET).getPublicUrl(path);
  return {
    blocked_dates_file_url: data?.publicUrl || '',
    blocked_dates_file_name: file.name || safeName,
    blocked_dates_file_type: file.type,
    blocked_dates_file_path: path
  };
}

export async function removeBlockedDatesFile(path) {
  if (!isSupabaseConfigured || !path) return;
  await supabase.storage.from(FIXED_EXCURSION_FILE_BUCKET).remove([path]);
}


function normalizeMonthlyLeaflet(row) {
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    month: row.month,
    year: row.year,
    title_it: row.title_it || '',
    title_en: row.title_en || '',
    file_url: row.file_url || '',
    file_path: row.file_path || '',
    file_name: row.file_name || '',
    file_type: row.file_type || '',
    active: row.active !== false,
    created_by: row.created_by || null,
    updated_by: row.updated_by || null
  };
}



export async function loadPublicMonthlyLeaflets() {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('public_monthly_availability_leaflets')
      .select('id, month, year, title_it, title_en, file_url, file_type, active')
      .eq('active', true)
      .order('year', { ascending: false })
      .order('month', { ascending: false });

    if (error) throw error;
    return Array.isArray(data) ? data.map(normalizeMonthlyLeaflet) : [];
  } catch (error) {
    console.warn('Supabase public monthly leaflets unavailable.', error?.message || error);
    return [];
  }
}

export async function listMonthlyLeaflets({ activeOnly = false } = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  let query = supabase
    .from('monthly_availability_leaflets')
    .select('id, created_at, updated_at, month, year, title_it, title_en, file_url, file_path, file_name, file_type, active, created_by, updated_by')
    .order('year', { ascending: false })
    .order('month', { ascending: false });

  if (activeOnly) query = query.eq('active', true);

  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data.map(normalizeMonthlyLeaflet) : [];
}

export async function createMonthlyLeaflet(input) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const payload = {
    month: Number.parseInt(input.month, 10),
    year: Number.parseInt(input.year, 10),
    title_it: input.title_it || null,
    title_en: input.title_en || null,
    file_url: input.file_url || null,
    file_path: input.file_path || null,
    file_name: input.file_name || null,
    file_type: input.file_type || null,
    active: input.active !== false,
    created_by: input.created_by || null,
    updated_by: input.updated_by || null
  };
  const { data, error } = await supabase.from('monthly_availability_leaflets').insert(payload).select('*').single();
  if (error) throw error;
  return normalizeMonthlyLeaflet(data);
}

export async function updateMonthlyLeaflet(id, input) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const payload = { ...input, updated_at: new Date().toISOString() };
  if (payload.month !== undefined) payload.month = Number.parseInt(payload.month, 10);
  if (payload.year !== undefined) payload.year = Number.parseInt(payload.year, 10);
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
  const { data, error } = await supabase.from('monthly_availability_leaflets').update(payload).eq('id', id).select('*').single();
  if (error) throw error;
  return normalizeMonthlyLeaflet(data);
}

export async function deactivateMonthlyLeaflet(id, userId) {
  return updateMonthlyLeaflet(id, { active: false, updated_by: userId || null });
}

export async function uploadMonthlyLeafletFile(file, userId) {
  const uploaded = await uploadBlockedDatesFile(file, userId);
  return {
    file_url: uploaded.blocked_dates_file_url,
    file_path: uploaded.blocked_dates_file_path,
    file_name: uploaded.blocked_dates_file_name,
    file_type: uploaded.blocked_dates_file_type
  };
}

export async function removeMonthlyLeafletFile(path) {
  return removeBlockedDatesFile(path);
}

export function defaultReason(status, lang) {
  const map = {
    closed: { it: 'Non disponibile', en: 'Closed' },
    limited: { it: 'Disponibilità limitata', en: 'Limited availability' },
    'on-request': { it: 'Su richiesta', en: 'On request' }
  };
  return map[status]?.[lang] || '';
}

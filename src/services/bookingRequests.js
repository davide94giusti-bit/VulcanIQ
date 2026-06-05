import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';
import { createAvailabilityBlock } from './availabilityService.js';

const requestFields = `
  id, created_at, updated_at, status, request_type, fixed_excursion_id,
  booking_code, review_submitted, review_submitted_at, removed_at, removed_by,
  customer_name, customer_email, customer_phone, preferred_contact,
  experience_id, requested_date, alternative_date, language,
  party_type, adults, children, children_under_3, private_experience,
  main_interest, preferred_pace, message,
  source, admin_note, decision_note, decided_at, decided_by,
  created_by_admin, availability_block_id
`;

function textOrNull(value) {
  const clean = typeof value === 'string' ? value.trim() : value;
  return clean === '' || clean === undefined ? null : clean;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function compactDateForCode(value) {
  const clean = String(value || '').trim();
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  return `${match[1]}${match[2]}${match[3]}`;
}

function randomCodeSuffix() {
  let suffix = '';
  for (let index = 0; index < 4; index += 1) {
    suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return suffix;
}

function stableCodeSuffix(value) {
  const clean = String(value || '').trim();
  if (!clean) return '';
  let hash = 0;
  for (let index = 0; index < clean.length; index += 1) {
    hash = ((hash << 5) - hash + clean.charCodeAt(index)) >>> 0;
  }
  let suffix = '';
  for (let index = 0; index < 4; index += 1) {
    suffix += CODE_ALPHABET[hash % CODE_ALPHABET.length];
    hash = Math.floor(hash / CODE_ALPHABET.length) || (hash + index + 17);
  }
  return suffix;
}

function makeBookingCode(date) {
  const datePart = compactDateForCode(date) || compactDateForCode(new Date().toISOString());
  return `VUL-${datePart}-${randomCodeSuffix()}`;
}

function stableBookingCodeForRequest(request) {
  if (request?.booking_code) return request.booking_code;
  const datePart = compactDateForCode(request?.requested_date) || compactDateForCode(request?.created_at) || compactDateForCode(new Date().toISOString());
  const suffix = stableCodeSuffix(`${request?.id || ''}|${datePart}|${request?.customer_email || ''}|${request?.customer_phone || ''}`);
  return suffix ? `VUL-${datePart}-${suffix}` : makeBookingCode(datePart);
}

function intOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function normalizeRequestInput(input, defaults = {}) {
  const requestedDate = textOrNull(input.requested_date);
  return {
    customer_name: textOrNull(input.customer_name ?? input.name),
    customer_email: textOrNull(input.customer_email ?? input.email),
    customer_phone: textOrNull(input.customer_phone ?? input.phone),
    preferred_contact: textOrNull(input.preferred_contact) || defaults.preferred_contact || 'unknown',
    experience_id: textOrNull(input.experience_id) || 'unsure',
    requested_date: requestedDate,
    alternative_date: textOrNull(input.alternative_date),
    language: textOrNull(input.language) || defaults.language || 'it',
    party_type: textOrNull(input.party_type),
    request_type: textOrNull(input.request_type) || defaults.request_type || 'private',
    fixed_excursion_id: textOrNull(input.fixed_excursion_id),
    booking_code: textOrNull(input.booking_code) || makeBookingCode(requestedDate || new Date().toISOString()),
    adults: intOrNull(input.adults),
    children: intOrNull(input.children),
    children_under_3: Boolean(input.children_under_3),
    private_experience: input.private_experience === '' || input.private_experience === undefined ? null : Boolean(input.private_experience),
    main_interest: textOrNull(input.main_interest),
    preferred_pace: textOrNull(input.preferred_pace),
    message: textOrNull(input.message),
    source: textOrNull(input.source) || defaults.source || 'website',
    admin_note: textOrNull(input.admin_note),
    status: defaults.status || input.status || 'pending',
    created_by_admin: input.created_by_admin || defaults.created_by_admin || null
  };
}

export async function createPublicBookingRequest(input) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const payload = normalizeRequestInput(input, { source: 'website', status: 'pending', language: input.language || 'it' });
  payload.source = 'website';
  payload.status = 'pending';
  delete payload.admin_note;
  delete payload.created_by_admin;

  const { error } = await supabase
    .from('booking_requests')
    .insert(payload);

  if (error) throw error;
  return { status: 'pending' };
}

export async function createManualBookingRequest(input, userId) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const payload = normalizeRequestInput(input, {
    source: input.source || 'manual',
    status: 'pending',
    created_by_admin: userId || null
  });

  const { data, error } = await supabase
    .from('booking_requests')
    .insert(payload)
    .select(requestFields)
    .single();

  if (error) throw error;
  return data;
}

export async function listBookingRequests(filters = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  let query = supabase
    .from('booking_requests')
    .select(requestFields)
    .order('created_at', { ascending: false })
    .limit(filters.limit || 250);

  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.experience_id && filters.experience_id !== 'all') query = query.eq('experience_id', filters.experience_id);
  if (filters.source && filters.source !== 'all') query = query.eq('source', filters.source);
  if (filters.fromDate) query = query.gte('requested_date', filters.fromDate);
  if (filters.toDate) query = query.lte('requested_date', filters.toDate);

  if (filters.search) {
    const clean = filters.search.trim().replaceAll(',', ' ');
    if (clean) {
      query = query.or(`customer_name.ilike.%${clean}%,customer_email.ilike.%${clean}%,customer_phone.ilike.%${clean}%`);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  const requests = data || [];
  const fixedIds = [...new Set(requests.map((request) => request.fixed_excursion_id).filter(Boolean))];

  if (!fixedIds.length) return requests;

  const { data: fixedRows, error: fixedError } = await supabase
    .from('fixed_excursions')
    .select('id, date, start_time, end_time, experience_id, title_it, title_en')
    .in('id', fixedIds);

  if (fixedError) throw fixedError;
  const fixedById = (fixedRows || []).reduce((acc, row) => ({ ...acc, [row.id]: row }), {});

  return requests.map((request) => ({
    ...request,
    fixed_excursion: fixedById[request.fixed_excursion_id] || null
  }));
}

export async function updateBookingRequest(id, payload) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

  const update = { ...payload, updated_at: new Date().toISOString() };
  Object.keys(update).forEach((key) => update[key] === undefined && delete update[key]);

  const { data, error } = await supabase
    .from('booking_requests')
    .update(update)
    .eq('id', id)
    .select(requestFields)
    .single();

  if (error) throw error;
  return data;
}

export async function approveBookingRequest({ request, userId, mode = 'accept-only', decisionNote = '', limitedScope = 'experience' }) {
  const accepted = await updateBookingRequest(request.id, {
    status: 'accepted',
    booking_code: request.booking_code || stableBookingCodeForRequest(request),
    decision_note: decisionNote || null,
    decided_at: new Date().toISOString(),
    decided_by: userId
  });

  if (mode === 'accept-only') return { request: accepted, block: null, availabilityError: null };

  const requestedDate = request.requested_date;
  if (!requestedDate) {
    return { request: accepted, block: null, availabilityError: new Error('Request has no requested date.') };
  }

  let blockInput = null;
  if (mode === 'close-experience') {
    blockInput = {
      date: requestedDate,
      experience_id: request.experience_id && request.experience_id !== 'unsure' ? request.experience_id : null,
      status: 'closed',
      reason_it: 'Esperienza non disponibile',
      reason_en: 'Experience unavailable'
    };
  }

  if (mode === 'close-global') {
    blockInput = {
      date: requestedDate,
      experience_id: null,
      status: 'closed',
      reason_it: 'Data non disponibile',
      reason_en: 'Date unavailable'
    };
  }

  if (mode === 'limited') {
    blockInput = {
      date: requestedDate,
      experience_id: limitedScope === 'global' ? null : (request.experience_id && request.experience_id !== 'unsure' ? request.experience_id : null),
      status: 'limited',
      reason_it: 'Disponibilità limitata',
      reason_en: 'Limited availability'
    };
  }

  try {
    const block = await createAvailabilityBlock({
      ...blockInput,
      internal_note: decisionNote || null,
      created_by: userId,
      updated_by: userId,
      booking_request_id: request.id
    });

    const updated = await updateBookingRequest(request.id, { availability_block_id: block.id });
    return { request: updated, block, availabilityError: null };
  } catch (error) {
    return { request: accepted, block: null, availabilityError: error };
  }
}

export async function declineBookingRequest({ request, userId, decisionNote = '', reasonCategory = '' }) {
  const note = [reasonCategory, decisionNote].filter(Boolean).join(' · ');
  return updateBookingRequest(request.id, {
    status: 'declined',
    decision_note: note || null,
    decided_at: new Date().toISOString(),
    decided_by: userId
  });
}


export async function cancelBookingRequest({ request, userId, decisionNote = '' }) {
  const note = ['removed/cancelled', decisionNote].filter(Boolean).join(' · ');
  return updateBookingRequest(request.id, {
    status: 'cancelled',
    decision_note: note || null,
    decided_at: new Date().toISOString(),
    decided_by: userId,
    removed_at: new Date().toISOString(),
    removed_by: userId
  });
}

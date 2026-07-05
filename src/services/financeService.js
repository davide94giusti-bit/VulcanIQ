import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';
import { normalizeCurrency, parseMoneyAmount } from '../utils/money.js';

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalize(row) {
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    entry_date: row.entry_date,
    type: row.type,
    amount: parseMoneyAmount(row.amount),
    currency: normalizeCurrency(row.currency),
    title: row.title || '',
    description: row.description || '',
    category: row.category || '',
    payment_method: row.payment_method || '',
    booking_request_id: row.booking_request_id || null,
    fixed_excursion_id: row.fixed_excursion_id || null,
    leaflet_id: row.leaflet_id || null,
    created_by: row.created_by || null,
    updated_by: row.updated_by || null,
    archived_at: row.archived_at || null,
    archived_by: row.archived_by || null,
    archive_reason: row.archive_reason || '',
    active: row.active !== false
  };
}

export async function listFinanceEntries(filters = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  let query = supabase
    .from('finance_entries')
    .select('id, created_at, updated_at, entry_date, type, amount, currency, title, description, category, payment_method, booking_request_id, fixed_excursion_id, leaflet_id, created_by, updated_by, archived_at, archived_by, archive_reason, active')
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(filters.limit || 500);

  if (filters.type && filters.type !== 'all') query = query.eq('type', filters.type);
  if (filters.category && filters.category !== 'all') query = query.eq('category', filters.category);
  if (filters.fromDate) query = query.gte('entry_date', filters.fromDate);
  if (filters.toDate) query = query.lte('entry_date', filters.toDate);
  if (!filters.includeArchived) query = query.eq('active', true);
  if (filters.linked === 'linked') query = query.or('booking_request_id.not.is.null,fixed_excursion_id.not.is.null,leaflet_id.not.is.null');
  if (filters.linked === 'unlinked') query = query.is('booking_request_id', null).is('fixed_excursion_id', null).is('leaflet_id', null);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalize);
}

export async function createFinanceEntry(input, userId) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const payload = {
    entry_date: input.entry_date,
    type: input.type,
    amount: parseMoneyAmount(input.amount),
    currency: normalizeCurrency(input.currency),
    title: cleanText(input.title),
    description: cleanText(input.description),
    category: cleanText(input.category),
    payment_method: cleanText(input.payment_method),
    booking_request_id: cleanText(input.booking_request_id),
    fixed_excursion_id: cleanText(input.fixed_excursion_id),
    leaflet_id: cleanText(input.leaflet_id),
    created_by: userId || null,
    updated_by: userId || null,
    active: input.active !== false
  };
  const { data, error } = await supabase
    .from('finance_entries')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return normalize(data);
}

export async function updateFinanceEntry(id, input, userId) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const payload = {
    ...input,
    updated_by: userId || null,
    updated_at: new Date().toISOString()
  };
  if (payload.amount !== undefined) payload.amount = parseMoneyAmount(payload.amount);
  if (payload.currency !== undefined) payload.currency = normalizeCurrency(payload.currency);
  ['booking_request_id', 'fixed_excursion_id', 'leaflet_id', 'description', 'category', 'payment_method'].forEach((key) => {
    if (payload[key] === '') payload[key] = null;
  });
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
  const { data, error } = await supabase
    .from('finance_entries')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return normalize(data);
}

export async function archiveFinanceEntry(id, userId, reason = '') {
  return updateFinanceEntry(id, {
    active: false,
    archived_at: new Date().toISOString(),
    archived_by: userId || null,
    archive_reason: reason || null
  }, userId);
}

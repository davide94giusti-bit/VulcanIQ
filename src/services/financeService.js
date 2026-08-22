import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';
import { normalizeCurrency, parseMoneyAmount } from '../utils/money.js';

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeStatus(value) {
  const clean = String(value || '').trim();
  return clean || 'confirmed';
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
    status: normalizeStatus(row.status),
    source_type: row.source_type || '',
    source_id: row.source_id || null,
    booking_request_id: row.booking_request_id || null,
    booking_code_id: row.booking_code_id || null,
    fixed_excursion_id: row.fixed_excursion_id || null,
    leaflet_id: row.leaflet_id || null,
    gift_card_request_id: row.gift_card_request_id || null,
    partner_commission_id: row.partner_commission_id || null,
    idempotency_key: row.idempotency_key || null,
    recognized_at: row.recognized_at || null,
    cancelled_at: row.cancelled_at || null,
    reversed_at: row.reversed_at || null,
    reversal_of: row.reversal_of || null,
    admin_confirmed_by: row.admin_confirmed_by || null,
    admin_confirmed_at: row.admin_confirmed_at || null,
    created_by: row.created_by || null,
    updated_by: row.updated_by || null,
    archived_at: row.archived_at || null,
    archived_by: row.archived_by || null,
    archive_reason: row.archive_reason || '',
    active: row.active !== false
  };
}

const FINANCE_SELECT_FIELDS = 'id, created_at, updated_at, entry_date, type, amount, currency, title, description, category, payment_method, status, source_type, source_id, booking_request_id, booking_code_id, fixed_excursion_id, leaflet_id, gift_card_request_id, partner_commission_id, idempotency_key, recognized_at, cancelled_at, reversed_at, reversal_of, admin_confirmed_by, admin_confirmed_at, created_by, updated_by, archived_at, archived_by, archive_reason, active';

export async function listFinanceEntries(filters = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  let query = supabase
    .from('finance_entries')
    .select(FINANCE_SELECT_FIELDS)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(filters.limit || 500);

  if (filters.type && filters.type !== 'all') query = query.eq('type', filters.type);
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.category && filters.category !== 'all') query = query.eq('category', filters.category);
  if (filters.fromDate) query = query.gte('entry_date', filters.fromDate);
  if (filters.toDate) query = query.lte('entry_date', filters.toDate);
  if (!filters.includeArchived) query = query.eq('active', true);
  if (filters.linked === 'linked') query = query.or('source_id.not.is.null,booking_request_id.not.is.null,booking_code_id.not.is.null,fixed_excursion_id.not.is.null,leaflet_id.not.is.null,gift_card_request_id.not.is.null,partner_commission_id.not.is.null');
  if (filters.linked === 'unlinked') query = query.is('source_id', null).is('booking_request_id', null).is('booking_code_id', null).is('fixed_excursion_id', null).is('leaflet_id', null).is('gift_card_request_id', null).is('partner_commission_id', null);

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
    status: normalizeStatus(input.status),
    source_type: cleanText(input.source_type),
    source_id: cleanText(input.source_id),
    booking_request_id: cleanText(input.booking_request_id),
    booking_code_id: cleanText(input.booking_code_id),
    fixed_excursion_id: cleanText(input.fixed_excursion_id),
    leaflet_id: cleanText(input.leaflet_id),
    gift_card_request_id: cleanText(input.gift_card_request_id),
    partner_commission_id: cleanText(input.partner_commission_id),
    idempotency_key: cleanText(input.idempotency_key),
    recognized_at: input.recognized_at || null,
    cancelled_at: input.cancelled_at || null,
    reversed_at: input.reversed_at || null,
    reversal_of: cleanText(input.reversal_of),
    admin_confirmed_by: cleanText(input.admin_confirmed_by),
    admin_confirmed_at: input.admin_confirmed_at || null,
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
  if (payload.status !== undefined) payload.status = normalizeStatus(payload.status);
  ['booking_request_id', 'booking_code_id', 'fixed_excursion_id', 'leaflet_id', 'gift_card_request_id', 'partner_commission_id', 'idempotency_key', 'description', 'category', 'payment_method', 'source_type', 'source_id', 'reversal_of', 'admin_confirmed_by'].forEach((key) => {
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


export async function reverseFinanceEntry(id, input = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const amount = parseMoneyAmount(input.amount);
  const entryDate = cleanText(input.entry_date);
  const paymentMethod = cleanText(input.payment_method);
  const reason = cleanText(input.reason);
  const idempotencyKey = cleanText(input.idempotency_key) || globalThis.crypto?.randomUUID?.() || `refund-${id}-${Date.now()}`;
  if (!id || amount <= 0 || !entryDate || !paymentMethod) throw new Error('Refund amount, date, and payment method are required.');
  const { data, error } = await supabase.rpc('admin_reverse_finance_entry', {
    p_entry_id: id,
    p_amount: amount,
    p_entry_date: entryDate,
    p_payment_method: paymentMethod,
    p_reason: reason || '',
    p_idempotency_key: idempotencyKey
  });
  if (error) throw error;
  return data;
}

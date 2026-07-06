import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';
import { normalizeCurrency, parseMoneyAmount } from '../utils/money.js';

const GIFT_CARD_FIELDS = `
  id, buyer_name, buyer_email, buyer_phone, buyer_preferred_language,
  recipient_name, experience_type, budget, currency, message, preferred_delivery_date,
  status, admin_note, finance_entry_id, created_at, updated_at, created_by, updated_by
`;

const TERMINAL_REVENUE_STATUSES = new Set(['paid', 'issued']);
const CANCELLED_FINANCE_STATUSES = new Set(['cancelled', 'void', 'voided', 'reversed', 'reversal']);

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function cleanBudget(value) {
  const parsed = parseMoneyAmount(value);
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : null;
}

function normalize(row) {
  if (!row) return null;
  return {
    ...row,
    buyer_preferred_language: row.buyer_preferred_language === 'en' ? 'en' : 'it',
    budget: cleanBudget(row.budget) || 0,
    currency: normalizeCurrency(row.currency),
    status: row.status || 'new'
  };
}

export function normalizeGiftCardStatus(value) {
  const clean = String(value || '').trim().toLowerCase();
  return ['new', 'contacted', 'quoted', 'paid', 'issued', 'cancelled'].includes(clean) ? clean : 'new';
}

export async function createGiftCardRequest(input = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const payload = {
    buyer_name: cleanText(input.buyer_name || input.buyerName),
    buyer_email: cleanText(input.buyer_email || input.buyerEmail),
    buyer_phone: cleanText(input.buyer_phone || input.buyerPhone),
    buyer_preferred_language: input.buyer_preferred_language === 'en' || input.language === 'en' ? 'en' : 'it',
    recipient_name: cleanText(input.recipient_name || input.recipientName),
    experience_type: cleanText(input.experience_type || input.experienceType),
    budget: cleanBudget(input.budget),
    currency: normalizeCurrency(input.currency),
    message: cleanText(input.message),
    preferred_delivery_date: cleanText(input.preferred_delivery_date || input.preferredDeliveryDate),
    status: 'new'
  };
  const { error } = await supabase
    .from('gift_card_requests')
    .insert(payload);
  if (error) throw error;
  return normalize({ ...payload, id: null, created_at: new Date().toISOString() });
}

export async function listGiftCardRequests(filters = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  let query = supabase
    .from('gift_card_requests')
    .select(GIFT_CARD_FIELDS)
    .order('created_at', { ascending: false })
    .limit(Number(filters.limit || 250));
  if (filters.status && filters.status !== 'all') query = query.eq('status', normalizeGiftCardStatus(filters.status));
  const search = cleanText(filters.search)?.replaceAll(',', ' ');
  if (search) {
    query = query.or(`buyer_name.ilike.%${search}%,buyer_email.ilike.%${search}%,buyer_phone.ilike.%${search}%,recipient_name.ilike.%${search}%,experience_type.ilike.%${search}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalize);
}

export async function updateGiftCardRequest(id, input = {}, userId = null) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const payload = { updated_by: userId || null, updated_at: new Date().toISOString() };
  if (input.status !== undefined) payload.status = normalizeGiftCardStatus(input.status);
  if (input.admin_note !== undefined) payload.admin_note = cleanText(input.admin_note);
  if (input.budget !== undefined) payload.budget = cleanBudget(input.budget);
  if (input.currency !== undefined) payload.currency = normalizeCurrency(input.currency);
  if (input.preferred_delivery_date !== undefined) payload.preferred_delivery_date = cleanText(input.preferred_delivery_date);
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
  const { data, error } = await supabase
    .from('gift_card_requests')
    .update(payload)
    .eq('id', id)
    .select(GIFT_CARD_FIELDS)
    .single();
  if (error) throw error;
  if (TERMINAL_REVENUE_STATUSES.has(payload.status)) await ensureGiftCardFinance(normalize(data), userId);
  if (payload.status === 'cancelled') await cancelGiftCardFinance(normalize(data), userId, 'gift card request cancelled');
  return normalize(data);
}

async function ensureGiftCardFinance(request, userId = null) {
  if (!request?.id || !cleanBudget(request.budget)) return null;
  const now = new Date().toISOString();
  const existing = await supabase
    .from('finance_entries')
    .select('id, status, active')
    .eq('source_type', 'gift_card')
    .eq('source_id', request.id)
    .limit(1);
  if (existing.error) throw existing.error;
  if (existing.data?.length) {
    const financeId = existing.data[0].id;
    const { data, error } = await supabase
      .from('finance_entries')
      .update({
        status: 'confirmed',
        active: true,
        amount: cleanBudget(request.budget),
        currency: normalizeCurrency(request.currency),
        admin_confirmed_at: now,
        admin_confirmed_by: userId || null,
        recognized_at: now,
        updated_by: userId || null
      })
      .eq('id', financeId)
      .select('id')
      .single();
    if (error) throw error;
    await supabase.from('gift_card_requests').update({ finance_entry_id: data.id, updated_by: userId || null }).eq('id', request.id);
    return data;
  }
  const { data, error } = await supabase
    .from('finance_entries')
    .insert({
      entry_date: new Date().toISOString().slice(0, 10),
      type: 'income',
      amount: cleanBudget(request.budget),
      currency: normalizeCurrency(request.currency),
      title: `Gift Card${request.recipient_name ? ` - ${request.recipient_name}` : ''}`,
      description: `Confirmed gift-card income from ${request.buyer_name || 'buyer'}`,
      category: 'gift_card',
      payment_method: 'external',
      source_type: 'gift_card',
      source_id: request.id,
      status: 'confirmed',
      active: true,
      recognized_at: now,
      admin_confirmed_at: now,
      admin_confirmed_by: userId || null,
      created_by: userId || null,
      updated_by: userId || null
    })
    .select('id')
    .single();
  if (error) throw error;
  await supabase.from('gift_card_requests').update({ finance_entry_id: data.id, updated_by: userId || null }).eq('id', request.id);
  return data;
}

async function cancelGiftCardFinance(request, userId = null, reason = '') {
  if (!request?.id) return;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('finance_entries')
    .select('id, status, amount, currency, title, description, category, payment_method, source_type, source_id, reversal_of')
    .eq('source_type', 'gift_card')
    .eq('source_id', request.id);
  if (error) throw error;
  for (const entry of data || []) {
    const status = String(entry.status || 'confirmed');
    if (entry.reversal_of || CANCELLED_FINANCE_STATUSES.has(status)) continue;
    if (status === 'confirmed') {
      const existingReversal = await supabase.from('finance_entries').select('id').eq('reversal_of', entry.id).limit(1);
      if (existingReversal.error) throw existingReversal.error;
      if (!existingReversal.data?.length && Number(entry.amount || 0) !== 0) {
        const insert = await supabase.from('finance_entries').insert({
          entry_date: new Date().toISOString().slice(0, 10),
          type: 'income',
          amount: -Math.abs(parseMoneyAmount(entry.amount)),
          currency: normalizeCurrency(entry.currency),
          title: `Reversal - ${entry.title || 'Gift Card'}`,
          description: reason || 'Gift-card request cancelled',
          category: entry.category || 'gift_card',
          payment_method: entry.payment_method || null,
          source_type: 'gift_card',
          source_id: request.id,
          status: 'reversal',
          reversal_of: entry.id,
          active: true,
          recognized_at: now,
          created_by: userId || null,
          updated_by: userId || null
        });
        if (insert.error) throw insert.error;
      }
      const update = await supabase.from('finance_entries').update({ status: 'reversed', reversed_at: now, updated_by: userId || null }).eq('id', entry.id);
      if (update.error) throw update.error;
    } else {
      const update = await supabase.from('finance_entries').update({ status: 'cancelled', active: false, cancelled_at: now, updated_by: userId || null, archive_reason: reason || null }).eq('id', entry.id);
      if (update.error) throw update.error;
    }
  }
}

import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';
import { DEFAULT_CURRENCY, normalizeCurrency, parseMoneyAmount } from '../utils/money.js';

const COMMISSION_SELECT_FIELDS = `
  id, partner_id, source_type, source_id, source_code,
  booking_request_id, booking_code_id, finance_entry_id,
  customer_display_name, experience_id, experience_title, experience_date,
  gross_amount, commission_type, commission_value, commission_amount, currency,
  status, status_notes, approved_at, paid_at, cancelled_at,
  created_at, updated_at, created_by, updated_by
`;

const PARTNER_FIELDS = 'id, name, commission_enabled, commission_type, commission_value, commission_currency, commission_applies_to, commission_notes, commission_status, active';
const COMMISSION_STATUSES = new Set(['pending', 'approved', 'paid', 'cancelled']);
const COMMISSION_TYPES = new Set(['none', 'fixed_amount', 'percentage']);

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function roundMoney(value) {
  const numeric = parseMoneyAmount(value);
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

function normalizeCommissionType(value) {
  const clean = String(value || 'none').trim();
  return COMMISSION_TYPES.has(clean) ? clean : 'none';
}

function normalizeStatus(value) {
  const clean = String(value || 'pending').trim();
  return COMMISSION_STATUSES.has(clean) ? clean : 'pending';
}

function sourceIdForType(sourceType, source = {}) {
  if (sourceType === 'booking_request') return source.id || source.booking_request_id || null;
  if (sourceType === 'booking_code') return source.id || source.booking_code_id || null;
  if (sourceType === 'manual_booking') return source.id || source.booking_request_id || null;
  return source.id || source.source_id || null;
}

function sourceFilter(sourceType, source = {}) {
  const id = sourceIdForType(sourceType, source);
  if (sourceType === 'booking_request' || sourceType === 'manual_booking') return { field: 'booking_request_id', value: id };
  if (sourceType === 'booking_code') return { field: 'booking_code_id', value: id };
  return { field: 'source_id', value: id };
}

function isConfirmedBookingRequest(request = {}) {
  const requestStatus = String(request.status || '').toLowerCase();
  const leadStatus = String(request.lead_status || '').toLowerCase();
  return ['accepted', 'confirmed', 'completed'].includes(requestStatus)
    || ['confirmed', 'completed', 'deposit_paid', 'review_requested', 'review_received'].includes(leadStatus);
}

function isEligibleForPartnerCommission({ sourceType, source = {}, partner = {}, financeEntryId = null, grossAmount = 0 }) {
  const appliesTo = String(partner.commission_applies_to || 'revenue_confirmed');
  if (appliesTo === 'request_created') return Boolean(sourceIdForType(sourceType, source));
  if (appliesTo === 'booking_confirmed') {
    if (sourceType === 'booking_code') return ['redeemed', 'completed'].includes(String(source.status || source.completion_status || '').toLowerCase());
    return isConfirmedBookingRequest(source);
  }
  if (appliesTo === 'revenue_confirmed') {
    if (financeEntryId) return true;
    if (parseMoneyAmount(grossAmount) <= 0) return false;
    if (sourceType === 'booking_code') return ['redeemed', 'completed'].includes(String(source.status || source.completion_status || '').toLowerCase());
    return isConfirmedBookingRequest(source);
  }
  return false;
}

function normalizePartner(row = {}) {
  return {
    id: row.id,
    name: row.name || '',
    active: row.active !== false,
    commission_enabled: row.commission_enabled === true,
    commission_type: normalizeCommissionType(row.commission_type),
    commission_value: parseMoneyAmount(row.commission_value),
    commission_currency: normalizeCurrency(row.commission_currency || DEFAULT_CURRENCY),
    commission_applies_to: row.commission_applies_to || 'revenue_confirmed',
    commission_status: row.commission_status || 'inactive',
    commission_notes: row.commission_notes || ''
  };
}

function normalizeCommission(row = {}, partner = null) {
  return {
    id: row.id,
    partner_id: row.partner_id || null,
    partner_name: partner?.name || row.partner_name || '',
    source_type: row.source_type || '',
    source_id: row.source_id || null,
    source_code: row.source_code || '',
    booking_request_id: row.booking_request_id || null,
    booking_code_id: row.booking_code_id || null,
    finance_entry_id: row.finance_entry_id || null,
    customer_display_name: row.customer_display_name || '',
    experience_id: row.experience_id || '',
    experience_title: row.experience_title || '',
    experience_date: row.experience_date || null,
    gross_amount: parseMoneyAmount(row.gross_amount),
    commission_type: normalizeCommissionType(row.commission_type),
    commission_value: parseMoneyAmount(row.commission_value),
    commission_amount: parseMoneyAmount(row.commission_amount),
    currency: normalizeCurrency(row.currency || partner?.commission_currency || DEFAULT_CURRENCY),
    status: normalizeStatus(row.status),
    status_notes: row.status_notes || '',
    approved_at: row.approved_at || null,
    paid_at: row.paid_at || null,
    cancelled_at: row.cancelled_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    created_by: row.created_by || null,
    updated_by: row.updated_by || null
  };
}

async function loadPartnersById(ids = []) {
  const cleanIds = [...new Set(ids.filter(Boolean))];
  if (!cleanIds.length) return new Map();
  const { data, error } = await supabase
    .from('partnerships')
    .select(PARTNER_FIELDS)
    .in('id', cleanIds);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.id, normalizePartner(row)]));
}

async function loadPartner(partnerId) {
  if (!partnerId) return null;
  const { data, error } = await supabase
    .from('partnerships')
    .select(PARTNER_FIELDS)
    .eq('id', partnerId)
    .single();
  if (error) throw error;
  return normalizePartner(data || {});
}

export function calculatePartnerCommission({ grossAmount, commissionType, commissionValue, currency = DEFAULT_CURRENCY }) {
  const normalizedGross = Math.max(0, parseMoneyAmount(grossAmount));
  const normalizedType = normalizeCommissionType(commissionType);
  const normalizedValue = Math.max(0, parseMoneyAmount(commissionValue));
  const normalizedCurrency = normalizeCurrency(currency || DEFAULT_CURRENCY);
  let amount = 0;

  if (normalizedType === 'fixed_amount') amount = normalizedValue;
  if (normalizedType === 'percentage') amount = normalizedGross * Math.min(normalizedValue, 100) / 100;

  return {
    grossAmount: roundMoney(normalizedGross),
    commissionType: normalizedType,
    commissionValue: roundMoney(normalizedValue),
    commissionAmount: roundMoney(amount),
    currency: normalizedCurrency
  };
}

export async function listPartnerCommissions(filters = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  let query = supabase
    .from('partner_commissions')
    .select(COMMISSION_SELECT_FIELDS)
    .order('created_at', { ascending: false })
    .limit(filters.limit || 500);

  if (filters.partnerId) query = query.eq('partner_id', filters.partnerId);
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.bookingRequestId) query = query.eq('booking_request_id', filters.bookingRequestId);
  if (filters.bookingCodeId) query = query.eq('booking_code_id', filters.bookingCodeId);
  if (filters.fromDate) query = query.gte('created_at', filters.fromDate);
  if (filters.toDate) query = query.lte('created_at', filters.toDate);

  const { data, error } = await query;
  if (error) throw error;
  const partnerMap = await loadPartnersById((data || []).map((row) => row.partner_id));
  return (data || []).map((row) => normalizeCommission(row, partnerMap.get(row.partner_id)));
}

export async function listPartnerCommissionSummary(filters = {}) {
  const commissions = await listPartnerCommissions({ ...filters, limit: filters.limit || 1000 });
  const summary = {
    pendingAmount: 0,
    approvedUnpaidAmount: 0,
    paidAmount: 0,
    cancelledAmount: 0,
    unpaidLiability: 0,
    pendingCount: 0,
    approvedCount: 0,
    paidCount: 0,
    cancelledCount: 0,
    byPartner: []
  };
  const byPartner = new Map();

  commissions.forEach((item) => {
    const amount = parseMoneyAmount(item.commission_amount);
    if (item.status === 'pending') { summary.pendingAmount += amount; summary.pendingCount += 1; }
    if (item.status === 'approved') { summary.approvedUnpaidAmount += amount; summary.approvedCount += 1; }
    if (item.status === 'paid') { summary.paidAmount += amount; summary.paidCount += 1; }
    if (item.status === 'cancelled') { summary.cancelledAmount += amount; summary.cancelledCount += 1; }
    const key = item.partner_id || 'unassigned';
    const current = byPartner.get(key) || {
      partner_id: item.partner_id || null,
      partner_name: item.partner_name || '—',
      pendingAmount: 0,
      approvedUnpaidAmount: 0,
      paidAmount: 0,
      cancelledAmount: 0,
      count: 0,
      lastCommissionDate: ''
    };
    if (item.status === 'pending') current.pendingAmount += amount;
    if (item.status === 'approved') current.approvedUnpaidAmount += amount;
    if (item.status === 'paid') current.paidAmount += amount;
    if (item.status === 'cancelled') current.cancelledAmount += amount;
    current.count += 1;
    const created = item.created_at || '';
    if (created && (!current.lastCommissionDate || created > current.lastCommissionDate)) current.lastCommissionDate = created;
    byPartner.set(key, current);
  });

  summary.unpaidLiability = summary.pendingAmount + summary.approvedUnpaidAmount;
  summary.byPartner = [...byPartner.values()].sort((a, b) => (b.pendingAmount + b.approvedUnpaidAmount) - (a.pendingAmount + a.approvedUnpaidAmount));
  return { ...summary, commissions };
}

export async function assignPartnerToBookingRequest(requestId, partnerId, userId = null) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const payload = {
    partner_id: partnerId || null,
    partner_source_assigned_at: partnerId ? new Date().toISOString() : null,
    partner_source_assigned_by: partnerId ? userId || null : null,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase
    .from('booking_requests')
    .update(payload)
    .eq('id', requestId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function upsertPartnerCommissionForSource({ sourceType = 'booking_request', source = {}, partnerId = null, grossAmount = 0, financeEntryId = null, bookingCodeId = null, userId = null, statusNotes = '' } = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const resolvedPartnerId = partnerId || source.partner_id || null;
  const partner = await loadPartner(resolvedPartnerId);
  if (!partner || partner.commission_enabled !== true || partner.commission_type === 'none') return { commission: null, skipped: true, reason: 'partner_commission_disabled' };

  const sourceId = sourceIdForType(sourceType, source);
  if (!sourceId) return { commission: null, skipped: true, reason: 'missing_source_id' };

  const normalizedGross = parseMoneyAmount(grossAmount || source.quoted_amount || source.expected_value || source.expected_amount || 0);
  if (!isEligibleForPartnerCommission({ sourceType, source, partner, financeEntryId, grossAmount: normalizedGross })) {
    return { commission: null, skipped: true, reason: 'not_eligible' };
  }

  const calculation = calculatePartnerCommission({
    grossAmount: normalizedGross,
    commissionType: partner.commission_type,
    commissionValue: partner.commission_value,
    currency: partner.commission_currency
  });

  if (calculation.commissionAmount <= 0) return { commission: null, skipped: true, reason: 'zero_commission' };

  const filter = sourceFilter(sourceType, source);
  let existingRows = [];
  if (filter.value) {
    const existing = await supabase
      .from('partner_commissions')
      .select(COMMISSION_SELECT_FIELDS)
      .eq(filter.field, filter.value)
      .limit(1);
    if (existing.error) throw existing.error;
    existingRows = existing.data || [];
  }
  const existing = existingRows[0] || null;
  const payload = {
    partner_id: resolvedPartnerId,
    source_type: sourceType,
    source_id: sourceId,
    source_code: cleanText(source.booking_code || source.code || source.source_code),
    booking_request_id: sourceType === 'booking_request' || sourceType === 'manual_booking' ? sourceId : cleanText(source.booking_request_id),
    booking_code_id: sourceType === 'booking_code' ? (bookingCodeId || sourceId) : cleanText(bookingCodeId || source.booking_code_id),
    finance_entry_id: cleanText(financeEntryId || source.finance_entry_id),
    customer_display_name: cleanText(source.customer_name || source.customer_display_name),
    experience_id: cleanText(source.experience_id),
    experience_title: cleanText(source.experience_title || source.experience_name_it || source.experience_name_en),
    experience_date: cleanText(source.requested_date || source.scheduled_date || source.experience_date),
    gross_amount: calculation.grossAmount,
    commission_type: calculation.commissionType,
    commission_value: calculation.commissionValue,
    commission_amount: calculation.commissionAmount,
    currency: calculation.currency,
    status_notes: cleanText(statusNotes),
    updated_by: userId || null,
    updated_at: new Date().toISOString()
  };

  if (existing) {
    if (existing.status === 'pending') {
      const { data, error } = await supabase
        .from('partner_commissions')
        .update(payload)
        .eq('id', existing.id)
        .select(COMMISSION_SELECT_FIELDS)
        .single();
      if (error) throw error;
      return { commission: normalizeCommission(data, partner), skipped: false, updated: true };
    }
    if (existing.status === 'approved' || existing.status === 'paid') {
      const previousAmount = parseMoneyAmount(existing.commission_amount);
      const nextAmount = parseMoneyAmount(payload.commission_amount);
      if (previousAmount !== nextAmount) {
        const note = [existing.status_notes, `Source amount changed: previous commission ${previousAmount}, recalculated ${nextAmount}`].filter(Boolean).join(' | ');
        const { data, error } = await supabase
          .from('partner_commissions')
          .update({ status_notes: note, updated_by: userId || null, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select(COMMISSION_SELECT_FIELDS)
          .single();
        if (error) throw error;
        return { commission: normalizeCommission(data, partner), skipped: false, flagged: true };
      }
    }
    return { commission: normalizeCommission(existing, partner), skipped: false, unchanged: true };
  }

  const { data, error } = await supabase
    .from('partner_commissions')
    .insert({ ...payload, status: 'pending', created_by: userId || null })
    .select(COMMISSION_SELECT_FIELDS)
    .single();
  if (error) throw error;
  return { commission: normalizeCommission(data, partner), skipped: false, created: true };
}

export async function updatePartnerCommissionStatus(id, status, notes = '', userId = null) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const normalized = normalizeStatus(status);
  const now = new Date().toISOString();
  const payload = {
    status: normalized,
    status_notes: cleanText(notes),
    updated_by: userId || null,
    updated_at: now
  };
  if (normalized === 'approved') payload.approved_at = now;
  if (normalized === 'paid') {
    payload.paid_at = now;
    payload.approved_at = now;
  }
  if (normalized === 'cancelled') payload.cancelled_at = now;

  const { data, error } = await supabase
    .from('partner_commissions')
    .update(payload)
    .eq('id', id)
    .select(COMMISSION_SELECT_FIELDS)
    .single();
  if (error) throw error;
  const partnerMap = await loadPartnersById([data.partner_id]);
  return normalizeCommission(data, partnerMap.get(data.partner_id));
}

export async function cancelUnpaidPartnerCommissionsForSource({ sourceType = 'booking_request', sourceId, userId = null, reason = '' } = {}) {
  if (!isSupabaseConfigured || !sourceId) return [];
  const filter = sourceFilter(sourceType, { id: sourceId });
  const { data, error } = await supabase
    .from('partner_commissions')
    .select(COMMISSION_SELECT_FIELDS)
    .eq(filter.field, filter.value);
  if (error) throw error;

  const updates = [];
  for (const item of data || []) {
    if (['pending', 'approved'].includes(item.status)) {
      const updated = await updatePartnerCommissionStatus(item.id, 'cancelled', reason || 'Source booking/request cancelled', userId);
      updates.push(updated);
    } else if (item.status === 'paid') {
      const note = [item.status_notes, reason || 'Source booking/request cancelled after commission was paid; manual review required.'].filter(Boolean).join(' | ');
      const { data: updated, error: updateError } = await supabase
        .from('partner_commissions')
        .update({ status_notes: note, updated_by: userId || null, updated_at: new Date().toISOString() })
        .eq('id', item.id)
        .select(COMMISSION_SELECT_FIELDS)
        .single();
      if (updateError) throw updateError;
      updates.push(normalizeCommission(updated));
    }
  }
  return updates;
}

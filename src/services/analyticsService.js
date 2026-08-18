import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

const EVENT_COLUMNS = 'id, event_name, session_id, visitor_id, occurred_at, path, section, language, referrer_domain, traffic_source, country_code, country_name, city, device_type, browser, operating_system, metadata, created_at';
const SESSION_COLUMNS = 'id, session_id, visitor_id, started_at, last_seen_at, duration_seconds, pageview_count, entry_path, exit_path, referrer_domain, traffic_source, country_code, country_name, city, language, device_type, browser, operating_system, created_at, updated_at';
const DEFAULT_RAW_PAGE_SIZE = 200;
const MAX_RAW_PAGE_SIZE = 500;

function assertConfigured() {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
}

function boundedPageSize(value, fallback = DEFAULT_RAW_PAGE_SIZE) {
  const parsed = Number.parseInt(value || fallback, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(25, Math.min(MAX_RAW_PAGE_SIZE, parsed));
}

function applyDateRange(query, column, filters = {}) {
  let next = query;
  if (filters.from) next = next.gte(column, filters.from);
  // Reporting ranges are half-open: [from, to).
  if (filters.to) next = next.lt(column, filters.to);
  return next;
}

export async function getAdminAnalyticsSummary(filters = {}) {
  assertConfigured();
  const { data, error } = await supabase.rpc('get_admin_analytics_summary', {
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_use_reporting_baseline: filters.useReportingBaseline !== false
  });
  if (error) throw error;
  return data || {};
}

export async function getAnalyticsReportingSettings() {
  assertConfigured();
  const { data, error } = await supabase.rpc('get_analytics_reporting_settings');
  if (error) throw error;
  return data || {};
}

export async function setAnalyticsReportingBaseline(iso = new Date().toISOString()) {
  assertConfigured();
  const { data, error } = await supabase.rpc('set_analytics_reporting_baseline', { p_baseline: iso });
  if (error) throw error;
  return data || {};
}

export async function clearAnalyticsReportingBaseline() {
  assertConfigured();
  const { data, error } = await supabase.rpc('clear_analytics_reporting_baseline');
  if (error) throw error;
  return data || {};
}

export async function listAnalyticsEventPage(filters = {}) {
  assertConfigured();
  const pageSize = boundedPageSize(filters.pageSize || filters.limit);
  const page = Math.max(0, Number.parseInt(filters.page || 0, 10) || 0);
  const offset = page * pageSize;
  let query = supabase
    .from('analytics_events')
    .select(EVENT_COLUMNS, { count: 'exact' })
    .order('occurred_at', { ascending: false })
    .range(offset, offset + pageSize - 1);
  query = applyDateRange(query, 'occurred_at', filters);
  if (filters.eventName && filters.eventName !== 'all') query = query.eq('event_name', filters.eventName);
  if (filters.language && filters.language !== 'all') query = query.eq('language', filters.language);
  if (filters.device && filters.device !== 'all') query = query.eq('device_type', filters.device);
  if (filters.country && filters.country !== 'all') query = query.eq('country_code', filters.country);
  const { data, error, count } = await query;
  if (error) throw error;
  const rows = data || [];
  const total = Number(count || 0);
  return {
    rows,
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total
  };
}

export async function listAnalyticsSessionPage(filters = {}) {
  assertConfigured();
  const pageSize = boundedPageSize(filters.pageSize || filters.limit);
  const page = Math.max(0, Number.parseInt(filters.page || 0, 10) || 0);
  const offset = page * pageSize;
  let query = supabase
    .from('analytics_sessions')
    .select(SESSION_COLUMNS, { count: 'exact' })
    .order('started_at', { ascending: false })
    .range(offset, offset + pageSize - 1);
  query = applyDateRange(query, 'started_at', filters);
  const { data, error, count } = await query;
  if (error) throw error;
  const rows = data || [];
  const total = Number(count || 0);
  return {
    rows,
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total
  };
}

// Backward-compatible helpers. These intentionally return a bounded diagnostic
// sample and must not be used for complete-period KPI calculations.
export async function listAnalyticsEvents(filters = {}) {
  const result = await listAnalyticsEventPage({ ...filters, page: 0, pageSize: filters.limit || DEFAULT_RAW_PAGE_SIZE });
  return result.rows;
}

export async function listAnalyticsSessions(filters = {}) {
  const result = await listAnalyticsSessionPage({ ...filters, page: 0, pageSize: filters.limit || DEFAULT_RAW_PAGE_SIZE });
  return result.rows;
}

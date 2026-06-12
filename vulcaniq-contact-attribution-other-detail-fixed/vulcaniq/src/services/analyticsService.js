import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

const EVENT_COLUMNS = 'id, event_name, session_id, visitor_id, occurred_at, path, section, language, referrer_domain, traffic_source, country_code, country_name, city, device_type, browser, operating_system, metadata, created_at';
const SESSION_COLUMNS = 'id, session_id, visitor_id, started_at, last_seen_at, duration_seconds, pageview_count, entry_path, exit_path, referrer_domain, traffic_source, country_code, country_name, city, language, device_type, browser, operating_system, created_at, updated_at';

function boundedLimit(value, fallback = 10000) {
  const limit = Number.parseInt(value || fallback, 10);
  if (!Number.isFinite(limit)) return fallback;
  return Math.max(100, Math.min(20000, limit));
}

function applyDateRange(query, column, filters = {}) {
  let next = query;
  if (filters.from) next = next.gte(column, filters.from);
  if (filters.to) next = next.lte(column, filters.to);
  return next;
}

export async function listAnalyticsEvents(filters = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  let query = supabase
    .from('analytics_events')
    .select(EVENT_COLUMNS)
    .order('occurred_at', { ascending: false })
    .limit(boundedLimit(filters.limit));
  query = applyDateRange(query, 'occurred_at', filters);
  if (filters.eventName && filters.eventName !== 'all') query = query.eq('event_name', filters.eventName);
  if (filters.language && filters.language !== 'all') query = query.eq('language', filters.language);
  if (filters.device && filters.device !== 'all') query = query.eq('device_type', filters.device);
  if (filters.country && filters.country !== 'all') query = query.eq('country_code', filters.country);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function listAnalyticsSessions(filters = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  let query = supabase
    .from('analytics_sessions')
    .select(SESSION_COLUMNS)
    .order('started_at', { ascending: false })
    .limit(boundedLimit(filters.limit));
  query = applyDateRange(query, 'started_at', filters);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

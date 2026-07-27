import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

const EMPTY = Object.freeze({
  pending_requests: 0,
  pending_over_12h: 0,
  pending_over_24h: 0,
  failed_notifications: 0,
  notifications_not_sent: 0,
  gift_cards_missing_code: 0,
  upcoming_unconfirmed_72h: 0,
  weekly_report_failures: 0,
  generated_at: null
});

export async function getOperationalSafeguards() {
  if (!isSupabaseConfigured) return { ...EMPTY };
  const { data, error } = await supabase.rpc('get_admin_operational_safeguards');
  if (error) throw error;
  return { ...EMPTY, ...(data || {}) };
}

export async function listWeeklyAdminReports(limit = 20) {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('admin_weekly_reports')
    .select('id,period_start,period_end,recipient,report_type,status,provider_message_id,error_message,generated_at,sent_at,updated_at')
    .order('generated_at', { ascending: false })
    .limit(Math.max(1, Math.min(100, Number(limit || 20))));
  if (error) throw error;
  return data || [];
}

export async function retryRequestNotification(requestTable, requestId) {
  const { data, error } = await supabase.functions.invoke('notify-new-request', {
    body: { retry: true, table: requestTable, id: requestId }
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.code || 'Notification retry failed.');
  return data;
}

export async function sendWeeklyAdminRecap({ testMode = true, force = false, reportId = null } = {}) {
  const { data, error } = await supabase.functions.invoke('send-weekly-admin-recap', {
    body: { test_mode: Boolean(testMode), force: Boolean(force), ...(reportId ? { resend_report_id: reportId } : {}) }
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.code || 'Weekly recap failed.');
  return data;
}

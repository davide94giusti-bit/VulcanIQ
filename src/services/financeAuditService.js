import { supabase } from '../lib/supabaseClient.js';

function safeFilename(value) { return String(value || 'vulcaniq-financial-audit').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 180); }

export async function downloadFinancialAudit({ from = '', to = '', locale = 'en', format = 'manifest' } = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('admin_session_required');
  const response = await fetch('/api/admin/finance-audit', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept-Language': locale },
    body: JSON.stringify({ from, to, locale, format })
  });
  if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || 'finance_audit_failed'); }
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const filename = safeFilename(disposition.match(/filename="([^"]+)"/)?.[1] || `vulcaniq-financial-audit.${format === 'manifest' ? 'json' : format}`);
  const url = URL.createObjectURL(blob);
  try { const link = document.createElement('a'); link.href = url; link.download = filename; link.rel = 'noopener'; document.body.appendChild(link); link.click(); link.remove(); }
  finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return { filename };
}

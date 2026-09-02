import { buildReadOnlyFinancialAudit } from '../../../src/domain/financeAudit.js';

const FINANCE_FIELDS = 'id,entry_date,type,amount,currency,status,source_type,source_id,booking_request_id,booking_code_id,gift_card_request_id,partner_commission_id,reversal_of,active,payment_method';
const AUDIT_ROLES = new Set(['owner', 'finance']);
const MAX_ROWS_PER_TABLE = 20000;

function response(status, body, headers = {}) {
  return new Response(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}
function json(status, body) { return response(status, JSON.stringify(body), { 'Content-Type': 'application/json; charset=utf-8' }); }
function bearer(request) { return (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || ''; }
function validDate(value) { return !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)); }
function cleanLocale(value) { return value === 'it' ? 'it' : 'en'; }
function config(env = {}) {
  const url = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anon = String(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '');
  return url && anon ? { url, anon } : null;
}
async function supabaseFetch(settings, token, path, options = {}) {
  return fetch(`${settings.url}${path}`, { ...options, headers: { apikey: settings.anon, Authorization: `Bearer ${token}`, Accept: 'application/json', ...(options.headers || {}) } });
}
async function requireAuditor(request, env) {
  const token = bearer(request); if (!token) return { response: json(401, { ok: false, error: 'admin_session_required' }) };
  const settings = config(env); if (!settings) return { response: json(500, { ok: false, error: 'finance_audit_not_configured' }) };
  const userResponse = await supabaseFetch(settings, token, '/auth/v1/user');
  if (!userResponse.ok) return { response: json(401, { ok: false, error: 'invalid_admin_session' }) };
  const user = await userResponse.json();
  const query = new URLSearchParams({ select: 'user_id,role,active', user_id: `eq.${user.id}`, active: 'eq.true', limit: '1' });
  const profileResponse = await supabaseFetch(settings, token, `/rest/v1/admin_profiles?${query}`);
  if (!profileResponse.ok) return { response: json(403, { ok: false, error: 'finance_audit_permission_denied' }) };
  const profile = (await profileResponse.json())?.[0];
  if (!profile?.active || !AUDIT_ROLES.has(profile.role)) return { response: json(403, { ok: false, error: 'finance_audit_permission_denied' }) };
  return { settings, token, user, profile };
}
async function fetchAll(settings, token, table, select, filters = []) {
  const output = []; const pageSize = 1000;
  for (let offset = 0; offset < MAX_ROWS_PER_TABLE; offset += pageSize) {
    const query = new URLSearchParams({ select, order: 'id.asc', limit: String(pageSize), offset: String(offset) });
    for (const [key, value] of filters) query.append(key, value);
    const result = await supabaseFetch(settings, token, `/rest/v1/${table}?${query}`);
    if (!result.ok) throw new Error(`finance_audit_${table}_${result.status}`);
    const rows = await result.json(); output.push(...rows);
    if (rows.length < pageSize) return output;
  }
  throw new Error(`finance_audit_${table}_row_limit_exceeded`);
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(stable(value))));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function buildSourceCounts({ bookings = [], bookingCodes = [], giftCards = [], partnerCommissions = [], financeEntries = [] } = {}) {
  return {
    bookingRequests: bookings.length,
    bookingCodes: bookingCodes.length,
    giftCards: giftCards.length,
    partnerCommissions: partnerCommissions.length,
    financeEntries: financeEntries.length
  };
}
export function safeCsv(value) {
  let cell = String(value ?? '').replace(/\r?\n/g, ' ');
  if (/^[\s]*[=+\-@]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replace(/"/g, '""')}"`;
}
function auditRows(report) {
  return [...report.classifications.safeDeterministic, ...report.classifications.humanReview]
    .sort((a, b) => [a.classification, a.reason, a.sourceType, a.sourceId].join('|').localeCompare([b.classification, b.reason, b.sourceType, b.sourceId].join('|')));
}
export function csvExport(metadata, report) {
  const rows = [['audit_id','generated_at','date_from','date_to','classification','reason','source_type','source_id','currency','amount']];
  for (const item of auditRows(report)) rows.push([metadata.auditId,metadata.generatedAt,metadata.dateRange.from,metadata.dateRange.to,item.classification,item.reason,item.sourceType,item.sourceId,item.currency,item.amount]);
  return `\uFEFF${rows.map((row) => row.map(safeCsv).join(',')).join('\r\n')}\r\n`;
}
function ascii(value) { return String(value ?? '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/[()\\]/g, (match) => `\\${match}`).slice(0, 110); }
export function pdfExport(metadata, report) {
  const lines = [
    'VulcanIQ - Financial Audit Summary', `Audit ID: ${metadata.auditId}`, `Generated at: ${metadata.generatedAt}`,
    `Date range: ${metadata.dateRange.from || 'all'} to ${metadata.dateRange.to || 'all'}`, `Generated by: ${metadata.generatedBy}`,
    `Source record count: ${metadata.recordCount}`, `Schema version: ${metadata.schemaVersion}`, `Locale: ${metadata.locale}`, `Canonical evidence SHA-256: ${metadata.evidenceChecksum || metadata.checksum}`, '',
    'Classification summary', ...report.categories.map((row) => `${row.code}: ${row.count}`), '',
    `Human review required: ${report.totals.humanReview}`, `Safe deterministic: ${report.totals.safeDeterministic}`,
    '', 'Summary only. Detailed evidence rows are provided in the CSV export.',
    'This operational report is not a legal certification or tax filing.'
  ].slice(0, 58);
  const stream = ['BT','/F1 11 Tf','50 790 Td','14 TL',...lines.flatMap((line, index) => index === 0 ? [`(${ascii(line)}) Tj`] : ['T*',`(${ascii(line)}) Tj`]),'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${new TextEncoder().encode(stream).byteLength} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(new TextEncoder().encode(pdf).byteLength); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = new TextEncoder().encode(pdf).byteLength;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}
async function logAudit(settings, token, userId, auditId, metadata) {
  const result = await supabaseFetch(settings, token, '/rest/v1/activity_log', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ actor_id: userId, action: 'financial_audit_generated', entity_type: 'financial_audit', entity_id: auditId, details: metadata }) });
  if (!result.ok) throw new Error(`finance_audit_log_${result.status}`);
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });
  const auth = await requireAuditor(request, env); if (auth.response) return auth.response;
  let input; try { input = await request.json(); } catch { return json(400, { ok: false, error: 'invalid_json' }); }
  const from = String(input?.from || ''); const to = String(input?.to || ''); const locale = cleanLocale(input?.locale); const format = ['csv','pdf','manifest'].includes(input?.format) ? input.format : 'manifest';
  if (!validDate(from) || !validDate(to) || from && to && from > to) return json(400, { ok: false, error: 'invalid_date_range' });
  const createdFilters = []; if (from) createdFilters.push(['created_at', `gte.${from}T00:00:00Z`]); if (to) createdFilters.push(['created_at', `lte.${to}T23:59:59Z`]);
  const entryFilters = []; if (from) entryFilters.push(['entry_date', `gte.${from}`]); if (to) entryFilters.push(['entry_date', `lte.${to}`]);
  try {
    const [bookings, bookingCodes, giftCards, partnerCommissions, financeEntries] = await Promise.all([
      fetchAll(auth.settings,auth.token,'booking_requests','id,status,lead_status,quoted_amount,expected_value,currency,created_at',createdFilters),
      fetchAll(auth.settings,auth.token,'booking_codes','id,status,expected_amount,currency,payment_status,created_at',createdFilters),
      fetchAll(auth.settings,auth.token,'gift_card_requests','id,status,budget,currency,created_at',createdFilters),
      fetchAll(auth.settings,auth.token,'partner_commissions','id,status,commission_amount,currency,created_at',createdFilters),
      fetchAll(auth.settings,auth.token,'finance_entries',FINANCE_FIELDS,entryFilters)
    ]);
    const report = buildReadOnlyFinancialAudit({ bookings, bookingCodes, giftCards, partnerCommissions, financeEntries });
    const auditId = crypto.randomUUID(); const generatedAt = new Date().toISOString();
    const sourceCounts = buildSourceCounts({ bookings, bookingCodes, giftCards, partnerCommissions, financeEntries });
    const recordCount = Object.values(sourceCounts).reduce((sum, value) => sum + value, 0);
    const evidenceChecksum = await sha256({ dateRange:{from,to}, sourceCounts, report });
    const metadata = { auditId, generatedAt, dateRange:{from,to}, generatedBy:auth.user.id, recordCount, sourceCounts, filters:{dateBasis:'finance.entry_date; related records.created_at'}, schemaVersion:'vulcaniq-financial-audit/1', evidenceChecksum, checksum:evidenceChecksum, checksumScope:'canonical_evidence_not_file_bytes', locale, piiIncluded:false };
    await logAudit(auth.settings,auth.token,auth.user.id,auditId,metadata);
    const filenameBase = `vulcaniq-financial-audit-${from || 'all'}-${to || 'all'}-${auditId}`;
    if (format === 'csv') return response(200,csvExport(metadata,report),{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${filenameBase}-detailed-evidence.csv"`});
    if (format === 'pdf') return response(200,pdfExport(metadata,report),{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${filenameBase}-summary.pdf"`});
    return response(200,JSON.stringify({metadata}),{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="${filenameBase}-integrity-manifest.json"`});
  } catch (error) {
    console.error('finance_audit_failed',{name:String(error?.name||'Error'),code:String(error?.message||'').slice(0,120)});
    return json(500,{ok:false,error:'finance_audit_failed'});
  }
}

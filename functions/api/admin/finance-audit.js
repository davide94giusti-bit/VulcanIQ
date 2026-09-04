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
function ascii(value) { return String(value ?? '').normalize('NFKD').replace(/[^\x20-\x7E]/g, ''); }
function pdfText(value) { return ascii(value).replace(/[()\\]/g, (match) => `\\${match}`); }
function wrapPdfText(value, maxCharacters = 78) {
  const words = ascii(value).trim().split(/\s+/).filter(Boolean); const lines = []; let line = '';
  for (const word of words) {
    if (word.length > maxCharacters) {
      if (line) { lines.push(line); line = ''; }
      for (let offset = 0; offset < word.length; offset += maxCharacters) lines.push(word.slice(offset, offset + maxCharacters));
    } else if (!line || `${line} ${word}`.length <= maxCharacters) line = line ? `${line} ${word}` : word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
function humanizeClassification(value) {
  return ascii(value).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
export function pdfExport(metadata, report) {
  const it = metadata.locale === 'it';
  const copy = {
    title: it ? 'Riepilogo Audit Finanziario' : 'Financial Audit Summary',
    executive: it ? 'Riepilogo esecutivo' : 'Executive summary',
    records: it ? 'Record sorgente' : 'Source records',
    review: it ? 'Revisione umana' : 'Human review required',
    safe: it ? 'Sicuri deterministici' : 'Safe deterministic',
    classification: it ? 'Panoramica classificazioni' : 'Classification overview',
    classificationColumn: it ? 'Classificazione' : 'Classification',
    count: it ? 'Conteggio' : 'Count',
    status: 'Status',
    reviewStatus: it ? 'Da verificare' : 'Review',
    observedStatus: it ? 'Osservato' : 'Observed',
    none: it ? 'Nessuna classificazione nel periodo.' : 'No classifications in this period.',
    evidence: it ? 'Evidenza e metadati' : 'Evidence & metadata',
    disclaimer: it
      ? 'Solo riepilogo. Le righe di evidenza dettagliate sono nel CSV. Report operativo, non certificazione legale o fiscale.'
      : 'Summary only. Detailed evidence rows are provided in the CSV export. This operational report is not a legal certification or tax filing.'
  };
  const colors = { navy: '0.051 0.106 0.196', slate: '0.188 0.275 0.337', muted: '0.365 0.412 0.478', lava: '0.941 0.302 0.192', cream: '0.965 0.941 0.902', white: '1 1 1', line: '0.855 0.831 0.792', green: '0.122 0.373 0.314', amber: '0.733 0.431 0.125' };
  const pages = []; let page = null; let y = 0;
  const addPage = (continuation = false) => {
    page = []; pages.push(page);
    page.push(`${colors.navy} rg 0 780 595 62 re f`);
    page.push(`${colors.lava} rg 42 780 86 5 re f`);
    page.push(`BT /F2 9 Tf ${colors.white} rg 42 814 Td (VULCANIQ | OPERATIONS) Tj ET`);
    page.push(`BT /F2 ${continuation ? 16 : 23} Tf ${colors.white} rg 42 ${continuation ? 790 : 790} Td (${pdfText(copy.title)}${continuation ? ' - continued' : ''}) Tj ET`);
    y = 752;
  };
  const drawText = (value, x, baseline, size = 9, font = 'F1', color = colors.slate) => page.push(`BT /${font} ${size} Tf ${color} rg ${x} ${baseline} Td (${pdfText(value)}) Tj ET`);
  const drawWrapped = (value, x, baseline, maxCharacters, size = 9, leading = 12, font = 'F1', color = colors.slate) => {
    const lines = wrapPdfText(value, maxCharacters);
    lines.forEach((line, index) => drawText(line, x, baseline - index * leading, size, font, color));
    return baseline - lines.length * leading;
  };
  const sectionTitle = (title) => { drawText(title, 42, y, 13, 'F2', colors.navy); y -= 24; };
  const ensureSpace = (required) => { if (y - required < 76) { addPage(true); } };

  addPage();
  drawText(`Audit ID  ${metadata.auditId}`, 42, 758, 8, 'F1', colors.muted);
  drawText(`Generated  ${metadata.generatedAt}`, 315, 758, 8, 'F1', colors.muted);
  drawText(`Period  ${metadata.dateRange.from || 'all'} to ${metadata.dateRange.to || 'all'}`, 42, 744, 8, 'F1', colors.muted);
  y = 714;
  sectionTitle(copy.executive);
  const cards = [
    [copy.records, metadata.recordCount ?? 0, colors.navy],
    [copy.review, report.totals.humanReview ?? 0, colors.amber],
    [copy.safe, report.totals.safeDeterministic ?? 0, colors.green]
  ];
  cards.forEach(([label, value, accent], index) => {
    const x = 42 + index * 174;
    page.push(`${colors.cream} rg ${x} ${y - 56} 160 62 re f`);
    page.push(`${accent} rg ${x} ${y - 56} 5 62 re f`);
    drawText(String(value), x + 16, y - 25, 22, 'F2', colors.navy);
    drawText(label, x + 16, y - 45, 8, 'F2', colors.muted);
  });
  y -= 88;
  sectionTitle(copy.classification);
  const reviewReasons = new Set((report.classifications?.humanReview || []).map((row) => row.reason));
  const categories = Array.isArray(report.categories) ? report.categories : [];
  const tableHeader = () => {
    page.push(`${colors.navy} rg 42 ${y - 4} 511 22 re f`);
    drawText(copy.classificationColumn, 52, y + 3, 8, 'F2', colors.white);
    drawText(copy.count, 414, y + 3, 8, 'F2', colors.white);
    drawText(copy.status, 477, y + 3, 8, 'F2', colors.white);
    y -= 28;
  };
  tableHeader();
  if (!categories.length) { drawText(copy.none, 52, y, 9, 'F1', colors.muted); y -= 28; }
  categories.forEach((row) => {
    if (y < 126) { addPage(true); sectionTitle(copy.classification); tableHeader(); }
    const review = reviewReasons.has(row.code);
    if (categories.indexOf(row) % 2 === 0) page.push(`${colors.cream} rg 42 ${y - 16} 511 27 re f`);
    drawText(humanizeClassification(row.code), 52, y, 8.5, 'F2', colors.navy);
    drawText(String(row.count ?? 0), 424, y, 9, 'F2', colors.navy);
    drawText(review ? copy.reviewStatus : copy.observedStatus, 477, y, 7.5, 'F2', review ? colors.amber : colors.green);
    drawText(row.code, 52, y - 11, 6.5, 'F1', colors.muted);
    y -= 27;
  });

  y -= 12;
  ensureSpace(190);
  sectionTitle(copy.evidence);
  const sourceCounts = metadata.sourceCounts || {};
  const evidenceRows = [
    ['Schema version', metadata.schemaVersion], ['Locale', metadata.locale], ['Generated by', metadata.generatedBy],
    ['Booking requests', sourceCounts.bookingRequests ?? 0], ['Booking codes', sourceCounts.bookingCodes ?? 0],
    ['Gift Cards', sourceCounts.giftCards ?? 0], ['Partner commissions', sourceCounts.partnerCommissions ?? 0],
    ['Finance entries', sourceCounts.financeEntries ?? 0]
  ];
  evidenceRows.forEach(([label, value], index) => {
    if (index % 2 === 0) page.push(`${colors.cream} rg 42 ${y - 10} 511 18 re f`);
    drawText(label, 52, y, 8, 'F2', colors.muted); drawText(String(value ?? ''), 190, y, 8, 'F1', colors.slate); y -= 18;
  });
  y -= 4;
  drawText('Canonical evidence SHA-256', 52, y, 8, 'F2', colors.muted);
  y = drawWrapped(metadata.evidenceChecksum || metadata.checksum || '', 190, y, 46, 7.5, 10, 'F1', colors.slate) - 6;
  ensureSpace(56);
  y = drawWrapped(copy.disclaimer, 42, y, 96, 8, 11, 'F1', colors.muted);

  pages.forEach((commands, index) => {
    commands.push(`${colors.line} RG 42 50 m 553 50 l S`);
    commands.push(`BT /F1 7 Tf ${colors.muted} rg 42 34 Td (vulcanIQ Financial Audit Summary | Evidence checksum covers canonical data, not file bytes.) Tj ET`);
    commands.push(`BT /F2 7 Tf ${colors.muted} rg 510 34 Td (${index + 1} / ${pages.length}) Tj ET`);
  });
  const pageObjectIds = pages.map((_, index) => 5 + index * 2);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'
  ];
  pages.forEach((commands, index) => {
    const contentId = pageObjectIds[index] + 1; const stream = commands.join('\n');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${new TextEncoder().encode(stream).byteLength} >>\nstream\n${stream}\nendstream`);
  });
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
      fetchAll(auth.settings,auth.token,'booking_requests','id,status,lead_status,quoted_amount,expected_value,created_at',createdFilters),
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

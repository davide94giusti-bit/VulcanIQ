#!/usr/bin/env node
import fs from 'node:fs/promises';
import process from 'node:process';
import { buildReadOnlyFinancialAudit } from '../src/domain/financeAudit.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : ''; };

async function restRows(baseUrl, anonKey, accessToken, table, select) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams({ select, limit: String(pageSize), offset: String(offset) });
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/rest/v1/${table}?${params}`, {
      method: 'GET',
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`${table} read failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`${table} returned an unexpected payload`);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function liveInput() {
  const baseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const accessToken = process.env.SUPABASE_ADMIN_ACCESS_TOKEN;
  if (!baseUrl || !anonKey || !accessToken) {
    throw new Error('Live read-only audit requires SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_ADMIN_ACCESS_TOKEN. It never uses the service-role key.');
  }
  const bookings = await restRows(baseUrl, anonKey, accessToken, 'booking_requests', 'id,status,lead_status,quoted_amount,expected_value');
  const bookingCodes = await restRows(baseUrl, anonKey, accessToken, 'booking_codes', 'id,status,expected_amount,currency,payment_status,income_status');
  const giftCards = await restRows(baseUrl, anonKey, accessToken, 'gift_card_requests', 'id,status,budget,currency');
  const partnerCommissions = await restRows(baseUrl, anonKey, accessToken, 'partner_commissions', 'id,status,commission_amount,currency');
  const modernFinance = 'id,entry_date,type,amount,currency,category,payment_method,status,source_type,source_id,booking_request_id,booking_code_id,fixed_excursion_id,leaflet_id,gift_card_request_id,partner_commission_id,idempotency_key,reversal_of,active';
  const legacyFinance = 'id,entry_date,type,amount,currency,category,payment_method,status,source_type,source_id,booking_request_id,booking_code_id,fixed_excursion_id,leaflet_id,reversal_of,active';
  let financeEntries;
  try { financeEntries = await restRows(baseUrl, anonKey, accessToken, 'finance_entries', modernFinance); }
  catch (error) {
    if (!/gift_card_request_id|partner_commission_id|idempotency_key|column/i.test(String(error.message || error))) throw error;
    financeEntries = await restRows(baseUrl, anonKey, accessToken, 'finance_entries', legacyFinance);
  }
  return { bookings, bookingCodes, giftCards, partnerCommissions, financeEntries };
}

function humanText(report) {
  const lines = [
    'VulcanIQ read-only financial reconciliation audit',
    `Generated: ${report.generatedAt}`,
    'PII included: no',
    '',
    `Rows: bookings=${report.totals.bookings}, bookingCodes=${report.totals.bookingCodes}, giftCards=${report.totals.giftCards}, commissions=${report.totals.partnerCommissions}, financeEntries=${report.totals.financeEntries}`,
    `HUMAN REVIEW REQUIRED: ${report.totals.humanReview}`,
    `SAFE DETERMINISTIC: ${report.totals.safeDeterministic}`,
    ''
  ];
  for (const category of report.categories) {
    const totals = Object.entries(category.totalsByCurrency).map(([currency, amount]) => `${currency} ${amount.toFixed(2)}`).join(', ') || '-';
    lines.push(`${category.code}: ${category.count} (${totals})`);
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  if (flag('--help') || (!flag('--live') && !value('--input'))) {
    console.log('Usage: node tools/finance-reconciliation-audit.mjs --input <export.json> [--output report.json]');
    console.log('   or: node tools/finance-reconciliation-audit.mjs --live [--output report.json]');
    console.log('Live mode is GET-only and requires SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_ADMIN_ACCESS_TOKEN.');
    process.exit(flag('--help') ? 0 : 2);
  }
  const input = flag('--live') ? await liveInput() : JSON.parse(await fs.readFile(value('--input'), 'utf8'));
  const report = buildReadOnlyFinancialAudit(input);
  const output = value('--output');
  if (output) await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(humanText(report));
  if (output) console.log(`JSON report: ${output}`);
}

main().catch((error) => { console.error(`Audit failed: ${error.message || error}`); process.exit(1); });

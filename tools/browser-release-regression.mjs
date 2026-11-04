// Run against a production Vite build made with synthetic public settings only.
// Every backend/provider call is intercepted; no deployed application is permitted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(process.env.AUDIT_PLAYWRIGHT_MODULE?pathToFileURL(process.env.AUDIT_PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.AUDIT_RELEASE_BASE||'http://127.0.0.1:5184';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('Only loopback is allowed');
const browser=await chromium.launch({headless:true,channel:process.env.AUDIT_BROWSER_CHANNEL||'chrome'});
const context=await browser.newContext({viewport:{width:1280,height:900}});
const user={id:'22222222-2222-4222-8222-222222222222',email:'synthetic-owner@example.invalid',aud:'authenticated',role:'authenticated'};
const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600}].map(item=>Buffer.from(JSON.stringify(item)).toString('base64url')).concat(Buffer.from('synthetic-signature').toString('base64url')).join('.');
let intercepted=0;
let financeFixture = null;
const financeWrites = [];
const financeRow = (id, title, patch = {}) => ({
  id: `30000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  title, entry_date: '2026-10-27', created_at: '2026-10-27T10:00:00Z', updated_at: '2026-10-27T10:00:00Z',
  type: 'income', amount: 100, currency: 'EUR', status: 'confirmed', active: true,
  source_type: 'manual', category: 'other_income', payment_method: 'cash', ...patch
});
await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin===base&&!url.pathname.startsWith('/api/'))return route.continue();
  intercepted++;let body=[];
  if(url.pathname==='/auth/v1/token')body={access_token:jwt,refresh_token:'synthetic-refresh-token',expires_in:3600,token_type:'bearer',user};
  else if(url.pathname==='/auth/v1/user')body=user;
  else if(url.pathname==='/rest/v1/admin_profiles')body=route.request().headers().accept?.includes('vnd.pgrst.object')?{user_id:user.id,active:true,role:'owner',full_name:'Synthetic Owner'}:[{user_id:user.id,active:true,role:'owner',full_name:'Synthetic Owner'}];
  else if(url.pathname.includes('get_public_google_reviews'))body={reviews:[],summary:null};
  else if(url.pathname.includes('get_admin_booking_counts'))body={total:0,pending_total:0,pending_today:0,accepted_today:0,availability_today:0,upcoming_accepted:0,by_date:[]};
  else if(url.pathname.includes('get_admin_finance_summary'))body={byCurrency:[]};
  else if (financeFixture && url.pathname === '/rest/v1/finance_entries') {
    const request = route.request();
    const id = url.searchParams.get('id') || '';
    if (request.method() === 'GET') body = financeFixture.filter(row => (!id.startsWith('gt.') || row.id > id.slice(3)) && (url.searchParams.get('active') !== 'eq.true' || row.active));
    else {
      const row = financeFixture.find(item => id === `eq.${item.id}`);
      financeWrites.push({ method: request.method(), id: row?.id, body: request.postDataJSON() });
      if (request.method() !== 'PATCH' || !row || !['pending', 'expected'].includes(row.status)) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'RECOGNIZED_LEDGER_IMMUTABLE' }) });
      Object.assign(row, request.postDataJSON());
      body = row;
    }
  }
  else if(url.pathname.includes('/api/'))body={ok:true,items:[],enabled:false,preferences:{categories:[]}};
  return route.fulfill({contentType:'application/json',body:JSON.stringify(body),headers:{'access-control-allow-origin':'*'}});
});
const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(45000);page.on('pageerror',error=>errors.push(error.message));
let passed=0;const failures=[];async function test(name,run){try{await run();console.log('PASS '+name);passed++;}catch(error){console.error('FAIL '+name+': '+error.message);failures.push(name);}}
try{
  await test('production public entry does not load Admin/report/export chunks',async()=>{
    await page.goto(base+'/?lang=en');await page.getByRole('dialog',{name:'Privacy and analytics'}).waitFor();await page.getByRole('button',{name:'Reject analytics',exact:true}).click();
    const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(item=>item.name));assert.ok(resources.some(url=>/\/assets\/.+\.js/.test(url)),'expected production hashed JS, not Vite source');assert.equal(resources.some(url=>/AdminApp|AskNeoPanel|VideoOptimizer|backupService|financeAuditService/.test(url)),false);assert.deepEqual(errors,[]);
  });
  await test('production Admin login loads isolated implementation only on demand',async()=>{
    await page.goto(base+'/admin/login?lang=en');await page.locator('#adminEmail').fill(user.email);await page.locator('#adminPassword').fill('synthetic-browser-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('.admin-shell').waitFor();
    const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(item=>item.name));assert.ok(resources.some(url=>/AdminApp.*\.js/.test(url)));assert.deepEqual(errors,[]);
  });
  const source=fs.readFileSync('src/features/admin/AdminApp.jsx','utf8'),section=source.slice(source.indexOf('const ADMIN_NAV_SECTIONS'),source.indexOf('const ADMIN_NAV_GROUPS'));
  const routes=[...new Set([...section.matchAll(/path: '(\/admin[^']*)'/g)].map(match=>match[1]))];assert.ok(routes.length>=15,'canonical route inventory unexpectedly empty');
  for(const route of routes)await test('production authenticated deep link '+route,async()=>{errors.length=0;await page.goto(base+route+'?lang=en');await page.locator('.admin-shell').waitFor();assert.ok(await page.locator('.admin-main').innerText(),'empty Admin content');assert.equal(new URL(page.url()).pathname,route);assert.deepEqual(errors,[]);});
  const entryCard = title => page.locator('.finance-entry-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  async function loadFinance(rows) {
    financeFixture = rows;
    await page.goto(base + '/admin/finance?lang=en');
    await page.locator('.finance-entries-panel > summary').click();
    await entryCard(rows[0].title).waitFor();
  }
  await test('recognized manual income exposes refund and details, never Edit or Archive', async () => {
    await loadFinance([financeRow(1, 'Synthetic recognized manual income')]);
    const card = entryCard('Synthetic recognized manual income');
    assert.equal(await card.getByRole('button', { name: 'Edit', exact: true }).count(), 0);
    assert.equal(await card.getByRole('button', { name: 'Archive', exact: true }).count(), 0);
    await card.getByRole('button', { name: 'Record refund', exact: true }).click();
    await page.getByRole('dialog', { name: 'Record refund / reversal' }).waitFor();
    await page.getByRole('dialog').locator('.admin-modal-header').getByRole('button', { name: 'Close', exact: true }).click();
    assert.equal(financeWrites.length, 0);
  });
  await test('recognized manual expenses and linked/reversed transactions are read-only with truthful correction guidance', async () => {
    const rows = [
      financeRow(2, 'Synthetic recognized manual expense', { type: 'expense', category: 'fuel' }),
      financeRow(3, 'Synthetic recognized linked income', { booking_request_id: '40000000-0000-4000-8000-000000000001' }),
      financeRow(4, 'Synthetic reversed manual income', { status: 'reversed', reversed_at: '2026-10-27T11:00:00Z' }),
      financeRow(5, 'Synthetic manual reversal', { status: 'reversal', amount: -10, reversal_of: '30000000-0000-4000-8000-000000000004' }),
      financeRow(6, 'Synthetic recognized metadata draft', { status: 'expected', recognized_at: '2026-10-27T11:00:00Z' })
    ];
    await loadFinance(rows);
    for (const row of rows) {
      const card = entryCard(row.title);
      assert.equal(await card.getByRole('button', { name: 'Edit', exact: true }).count(), 0, row.title);
      assert.equal(await card.getByRole('button', { name: 'Archive', exact: true }).count(), 0, row.title);
      assert.equal(await card.getByRole('button', { name: 'Details', exact: true }).count(), 1, row.title);
    }
    const expense = entryCard(rows[0].title);
    assert.equal(await expense.getByRole('button', { name: 'Record refund', exact: true }).count(), 0);
    assert.match(await expense.innerText(), /authorized.*correction|correction.*authorized/i);
  });
  await test('pending and expected drafts retain Edit and Archive and an actual draft save', async () => {
    const rows = [financeRow(7, 'Synthetic pending draft', { status: 'pending' }), financeRow(8, 'Synthetic expected draft', { status: 'expected' })];
    await loadFinance(rows);
    for (const row of rows) {
      assert.equal(await entryCard(row.title).getByRole('button', { name: 'Edit', exact: true }).count(), 1);
      assert.equal(await entryCard(row.title).getByRole('button', { name: 'Archive', exact: true }).count(), 1);
    }
    await entryCard(rows[0].title).getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('.finance-form-panel').getByLabel('Title', { exact: true }).fill('Synthetic pending draft revised');
    const before = financeWrites.length;
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await entryCard('Synthetic pending draft revised').waitFor();
    assert.equal(financeWrites.length, before + 1);
    assert.equal(financeWrites.at(-1).method, 'PATCH');
  });
  await test('refreshing a draft that became recognized invalidates the stale edit form without a write', async () => {
    const row = financeRow(9, 'Synthetic draft recognized elsewhere', { status: 'pending' });
    await loadFinance([row]);
    await entryCard(row.title).getByRole('button', { name: 'Edit', exact: true }).click();
    row.status = 'confirmed'; row.recognized_at = '2026-10-27T11:00:00Z'; row.updated_at = '2026-10-27T11:00:00Z';
    const before = financeWrites.length;
    await page.locator('.admin-page-header').getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: /no longer editable/i }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Save changes', exact: true }).count(), 0);
    assert.equal(await entryCard(row.title).getByRole('button', { name: 'Edit', exact: true }).count(), 0);
    assert.equal(financeWrites.length, before);
  });
  await test('manual creation and draft edits cannot assign or change booking source links', async () => {
    const bookingId = '40000000-0000-4000-8000-000000000001';
    const row = financeRow(10, 'Synthetic linked pending draft', { status: 'pending', booking_request_id: bookingId });
    await loadFinance([row]);
    const form = page.locator('.finance-form-panel');
    await form.locator(':scope > summary').click();
    assert.equal(await form.getByLabel('Linked booking').isDisabled(), true, 'manual source assignment must be unavailable');
    assert.equal(await form.getByLabel('Linked booking').inputValue(), '');
    await entryCard(row.title).getByRole('button', { name: 'Edit', exact: true }).click();
    const booking = form.getByLabel('Linked booking');
    assert.equal(await booking.isDisabled(), true, 'existing source linkage must be read-only');
    assert.equal(await booking.inputValue(), bookingId, 'preserve linkage even when the related request is outside this fixture');
    assert.match(await booking.innerText(), new RegExp(bookingId));
    assert.equal(await form.getByLabel('Linked fixed excursion').isDisabled(), false);
    assert.equal(await form.getByLabel('Linked monthly leaflet').isDisabled(), false);
    await form.getByLabel('Title', { exact: true }).fill('Synthetic linked pending draft revised');
    const before = financeWrites.length;
    await form.getByRole('button', { name: 'Save changes', exact: true }).click();
    await entryCard('Synthetic linked pending draft revised').waitFor();
    assert.equal(financeWrites.length, before + 1);
    assert.equal(financeWrites.at(-1).body.booking_request_id, bookingId);
  });
  await test('refund stays open for header/footer/Escape while in flight and creates one intent', async () => {
    const row = financeRow(11, 'Synthetic delayed refund');
    await loadFinance([row]);
    const refunds = [];
    let release, announce, complete;
    const held = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { announce = resolve; });
    const completed = new Promise(resolve => { complete = resolve; });
    const endpoint = '**/rest/v1/rpc/admin_reverse_finance_entry';
    await page.route(endpoint, async route => {
      refunds.push(route.request().postDataJSON());
      announce();
      await held;
      try {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'synthetic-reversal-result' }) });
      } finally { complete(); }
    });
    try {
      await entryCard(row.title).getByRole('button', { name: 'Record refund', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Record refund / reversal' });
      await dialog.getByLabel('Refund amount', { exact: true }).fill('20');
      await dialog.getByLabel('Refund method', { exact: true }).fill('cash');
      await dialog.getByRole('button', { name: 'Record refund', exact: true }).evaluate(button => { button.click(); button.click(); });
      await started;
      const headerClose = dialog.locator('.admin-modal-header').getByRole('button', { name: 'Close', exact: true });
      const footerClose = dialog.locator('.modal-actions').getByRole('button', { name: 'Close', exact: true });
      assert.equal(await headerClose.isDisabled(), true, 'header must not close an in-flight intent');
      assert.equal(await footerClose.isDisabled(), true);
      await headerClose.evaluate(button => button.click());
      await footerClose.evaluate(button => button.click());
      await page.keyboard.press('Escape');
      assert.equal(await dialog.count(), 1, 'all close paths must preserve the in-flight intent');
      await dialog.getByRole('button', { name: 'Recording...', exact: true }).evaluate(button => button.click());
      assert.equal(refunds.length, 1);
      assert.ok(refunds[0].p_idempotency_key);
      release();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(refunds.length, 1);
    } finally {
      release();
      if (refunds.length) await completed;
      await page.unroute(endpoint);
    }
  });
}finally{await browser.close();}
console.log(`Release browser: ${passed} passed, ${failures.length} failed; ${intercepted} external/API requests intercepted.`);process.exitCode=failures.length?1:0;

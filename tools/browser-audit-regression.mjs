import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const moduleName = process.env.AUDIT_PLAYWRIGHT_MODULE;
const { chromium } = await import(moduleName ? pathToFileURL(moduleName).href : 'playwright');
const base = process.env.AUDIT_BROWSER_BASE || 'http://127.0.0.1:5183';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw Error('Only loopback test servers are permitted');
const browser = await chromium.launch({ headless: true, channel: process.env.AUDIT_BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
await context.addInitScript(()=>{
  let counter=0;const widgets=new Map();
  window.turnstile={render(container,options){const id=String(++counter),button=document.createElement('button');button.type='button';button.textContent='Complete synthetic security check';button.addEventListener('click',()=>options.callback('synthetic-challenge-'+id));container.append(button);widgets.set(id,{button,options});return id;},remove(id){widgets.get(id)?.button.remove();widgets.delete(id);}};
  window.auditExpireChallenge=()=>[...widgets.values()].forEach(item=>item.options['expired-callback']());
});
const external = []; const failures = []; let passed = 0;
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin === base) {
    if (url.pathname === '/audit-harness') return route.fulfill({ contentType:'text/html', body:'<div id="root"></div><script type="module" src="/tools/browser-audit-fixture.jsx"></script>' });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ contentType:'application/json', body: JSON.stringify({ok:true,enabled:false,items:[],preferences:{categories:[]}}) });
    return route.continue();
  }
  external.push(url.origin + url.pathname);
  // Zero real provider, database, analytics or notification requests.
  return route.fulfill({ status:200, contentType:'application/json', body: url.pathname.includes('get_public_google_reviews') ? JSON.stringify({reviews:[],summary:null}) : '[]', headers:{'access-control-allow-origin':'*'} });
});
const page = await context.newPage(); const errors=[];
page.setDefaultTimeout(8000);
page.setDefaultNavigationTimeout(45000);
page.on('pageerror', error => errors.push(error.message));
async function test(name, run) { if(process.env.AUDIT_BROWSER_TEST&&!name.includes(process.env.AUDIT_BROWSER_TEST))return;try { await run(); console.log(`PASS ${name}`); passed++; } catch(error) { console.error(`FAIL ${name}: ${error.message}`); failures.push(name); } }
async function readyFastRequest(){
  await page.goto(`${base}/audit-harness`);await page.getByRole('button',{name:'Open Fast Request EN'}).click();const modal=page.getByRole('dialog',{name:'Check availability in a few steps'});
  await modal.getByRole('combobox',{name:/^Experience/}).selectOption('etna-learning');await modal.getByRole('button',{name:'Continue',exact:true}).click();await modal.getByRole('combobox',{name:/^Date/}).selectOption('flexible');await modal.getByRole('button',{name:'Continue',exact:true}).click();await modal.getByLabel('Adults',{exact:true}).fill('4');await modal.getByRole('button',{name:'Continue',exact:true}).click();await modal.locator('#fastRequestEmail').fill('synthetic@example.invalid');await modal.getByRole('button',{name:'Continue',exact:true}).click();await modal.locator('#fastRequestHeardAboutUs').selectOption('google');await modal.getByRole('button',{name:'Review message',exact:true}).click();
  await modal.getByRole('button',{name:'Complete synthetic security check'}).click();return modal;
}
try {
  await page.goto(`${base}/?lang=en`); await page.getByRole('dialog', {name:'Privacy and analytics'}).waitFor();
  await test('first visit stores no analytics identifiers before consent', async()=> {
    assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage).filter(key=>/analytics_(visitor|session)|first_touch/.test(key))),[]);
  });
  await test('privacy buttons are equal width at360px and dialog fits viewport',async()=>{
    const widths=await page.locator('.privacy-preferences-actions button').evaluateAll(nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().width)));
    assert.equal(new Set(widths).size,1); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  });
  await page.getByRole('button',{name:'Reject analytics',exact:true}).click();
  await test('public entry does not request the Admin implementation',async()=>{
    const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(row=>row.name));
    assert.equal(resources.some(url=>/AdminApp|AskNeoPanel|VideoOptimizer|backupService|financeAuditService/.test(url)),false);
  });
  await test('public UI renders without runtime errors',async()=>assert.deepEqual(errors,[]));
  await page.goto(`${base}/audit-harness`); await page.getByRole('button',{name:'Open parent',exact:true}).waitFor();
  await test('dialog initial focus, Tab/ShiftTab containment, nested Escape and focus restoration',async()=>{
    const opener=page.getByRole('button',{name:'Open parent',exact:true}); await opener.click();
    assert.equal(await page.getByRole('button',{name:'Close parent'}).evaluate(el=>el===document.activeElement),true);
    assert.equal(await page.getByRole('link',{name:'Background link',includeHidden:true}).evaluate(el=>Boolean(el.closest('[inert]'))),true);
    await page.keyboard.press('Shift+Tab'); assert.equal(await page.getByRole('textbox',{name:'Parent field'}).evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Tab'); assert.equal(await page.getByRole('button',{name:'Close parent'}).evaluate(el=>el===document.activeElement),true);
    await page.getByRole('button',{name:'Open child'}).click(); await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog',{name:'Child',exact:true}).count(),0);
    assert.equal(await page.getByRole('dialog',{name:'Parent',exact:true}).count(),1);
    await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({state:'detached'});
    await page.waitForFunction(()=>document.activeElement?.textContent==='Open parent');
  });
  await test('reversed query responses and stale finally never replace current filter data',async()=>{
    await page.getByRole('button',{name:'Query B'}).click();
    await page.waitForFunction(()=>window.auditFixture.pending('B'));
    await page.evaluate(()=>window.auditFixture.resolve('A',['stale']));
    assert.equal(JSON.parse(await page.getByLabel('query-state').textContent()).loading,true);
    await page.evaluate(()=>window.auditFixture.resolve('B',['current']));
    await page.waitForFunction(()=>document.querySelector('output').textContent.includes('current'));
    assert.deepEqual(JSON.parse(await page.getByLabel('query-state').textContent()).data,['current']);
  });
  await test('failed refresh preserves known data and exposes failure instead of empty',async()=>{
    await page.getByRole('button',{name:'Query C'}).click(); await page.waitForFunction(()=>window.auditFixture.pending('C')); await page.evaluate(()=>window.auditFixture.reject('C'));
    await page.waitForFunction(()=>JSON.parse(document.querySelector('output').textContent).error);
    assert.deepEqual(JSON.parse(await page.getByLabel('query-state').textContent()).data,['current']);
  });
  await test('real Fast Request keeps latest Learning/date/group draft after close and reopen without contact PII',async()=>{
    await page.goto(`${base}/audit-harness`);
    await page.getByRole('button',{name:'Open Fast Request EN'}).click();
    const modal=page.getByRole('dialog',{name:'Check availability in a few steps'});await modal.waitFor();
    assert.equal(await modal.locator('.modal-close-button').evaluate(el=>el===document.activeElement),true);
    await modal.getByRole('combobox',{name:/^Experience/}).selectOption('etna-learning');await modal.getByRole('button',{name:'Continue',exact:true}).click();
    await modal.getByRole('combobox',{name:/^Date/}).selectOption('custom');await modal.getByLabel('Preferred date').fill('2099-01-01');await modal.getByRole('button',{name:'Continue',exact:true}).click();
    await modal.getByLabel('Adults',{exact:true}).fill('4');await modal.getByRole('button',{name:'Continue',exact:true}).click();await modal.locator('#fastRequestEmail').fill('synthetic@example.invalid');
    await page.keyboard.press('Escape');await modal.waitFor({state:'detached'});
    const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('vulcaniq_fast_request')));assert.equal(draft.experienceId,'etna-learning');assert.equal(draft.adults,'4');assert.equal(draft.customDate,'2099-01-01');assert.equal('email' in draft,false);
    await page.getByRole('button',{name:'Open Fast Request EN'}).click();assert.equal(await modal.getByRole('combobox',{name:/^Experience/}).inputValue(),'etna-learning');
    await page.keyboard.press('Shift+Tab');assert.equal(await modal.evaluate(el=>el.contains(document.activeElement)),true);await page.keyboard.press('Tab');assert.equal(await modal.evaluate(el=>el.contains(document.activeElement)),true);
    await page.keyboard.press('Escape');await modal.waitFor({state:'detached'});await page.waitForFunction(()=>document.activeElement?.textContent==='Open Fast Request EN');
  });
  await test('Italian Fast Request360px heading does not overlap Close;200% zoom retains usable controls',async()=>{
    await page.goto(`${base}/audit-harness`);
    await page.getByRole('button',{name:'Open Fast Request IT'}).click();const modal=page.getByRole('dialog',{name:'Verifica disponibilità in pochi passaggi'});await modal.waitFor();
    try {
      // Native system fonts vary across platforms. Increased text size must not
      // exhaust a fixed-width gap between the heading and its close control.
      for (const fontSize of ['100%', '125%']) {
        await page.evaluate(value=>document.documentElement.style.fontSize=value,fontSize);
        const boxes=await modal.locator('header').evaluate(el=>{const title=el.querySelector('h2').getBoundingClientRect(),close=el.querySelector('button').getBoundingClientRect();return{title:{left:title.left,right:title.right},close:{left:close.left,right:close.right,width:close.width,height:close.height},wordBreak:getComputedStyle(el.querySelector('h2')).wordBreak};});
        assert.ok(boxes.title.right<=boxes.close.left+1,`Heading overlaps Close at ${fontSize}: ${JSON.stringify(boxes)}`);assert.ok(boxes.close.width>=44&&boxes.close.height>=44);assert.notEqual(boxes.wordBreak,'break-all');
      }
      await page.evaluate(()=>{document.documentElement.style.fontSize='';document.documentElement.style.zoom='2';});assert.equal(await modal.locator('.modal-close-button').isVisible(),true);assert.equal(await modal.locator('select').isVisible(),true);await page.keyboard.press('Escape');
    } finally { await page.evaluate(()=>{document.documentElement.style.zoom='';document.documentElement.style.fontSize='';}); }
  });
  await test('notification settings delayed GET never PATCHes defaults; explicit language/empty categories/quiet hours survive',async()=>{
    await page.goto(`${base}/audit-harness`);
    const patches=[];let release;const gate=new Promise(resolve=>release=resolve);let waiting=false;
    await page.route('**/api/notifications/preferences?**',async route=>{if(route.request().method()==='PATCH'){patches.push(route.request().postDataJSON());return route.fulfill({contentType:'application/json',body:'{"ok":true}'});}waiting=true;await gate;return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,pushEnabled:false,preferences:{languagePreference:'en',resolvedLocale:'en',categories:[],quietHoursEnabled:true,quietStart:'21:00',quietEnd:'08:00',timezone:'Europe/Rome'}})});});
    await page.getByRole('button',{name:'Toggle notification settings'}).click();
    await page.waitForFunction(()=>document.querySelector('.notifications-page'));for(let n=0;n<100&&!waiting;n++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(waiting,true);
    assert.deepEqual(patches,[]);await page.getByRole('button',{name:'Toggle fixture language'}).click();assert.deepEqual(patches,[]);release();
    await page.getByRole('button',{name:/Notification preferences|Preferenze notifiche/}).click();
    const save=page.getByRole('button',{name:/Save preferences|Salva preferenze/});await save.waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>/Save preferences|Salva preferenze/.test(el.textContent)&&!el.disabled));
    assert.equal(await page.locator('.notification-disclosure-body select').first().inputValue(),'en');assert.equal(await page.locator('input[type="time"]').first().inputValue(),'21:00');assert.equal(await page.locator('.notification-disclosure-body fieldset input:checked').count(),0);assert.deepEqual(patches,[]);
    await save.click();assert.equal(patches.length,1);assert.deepEqual(patches[0].categories,[]);assert.equal(patches[0].languagePreference,'en');assert.equal(patches[0].quietHoursEnabled,true);
    await page.getByRole('button',{name:'Toggle notification settings'}).click();await page.unroute('**/api/notifications/preferences?**');
  });
  await test('Fast Request double-click submits one canonical request and successful submit removes the draft',async()=>{
    const submissions=[];let release,finish;const gate=new Promise(resolve=>release=resolve),finished=new Promise(resolve=>finish=resolve);
    await page.route('**/api/public/booking-request',async route=>{submissions.push({body:route.request().postDataJSON(),key:route.request().headers()['idempotency-key']});await gate;try{await route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,id:'11111111-1111-4111-8111-111111111111'})});}finally{finish();}});
try{const modal=await readyFastRequest();const send=modal.locator('.fast-request-final-actions button.primary');await send.evaluate(button=>{button.click();button.click();});for(let n=0;n<100&&!submissions.length;n++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(submissions.length,1);assert.equal(await send.isDisabled(),true);release();await modal.locator('.form-status.success').waitFor();const{body,key}=submissions[0];assert.equal(body.experience_id,'etna-learning');assert.equal(body.adults,4);assert.equal(body.customer_email,'synthetic@example.invalid');assert.equal(body.notification_ownership_requested,false);for(const key of ['analytics_session_id','analytics_visitor_id','analytics_journey_id','utm_source','utm_medium','utm_campaign','utm_content','utm_term'])assert.ok(!body[key],`optional analytics leaked: ${key}`);assert.equal(body.booking_journey_version,'20261027-authoritative-website');assert.equal(body.submission_idempotency_key,key);assert.ok(key.length>=12);assert.match(body.turnstile_token,/^synthetic-challenge-/);assert.equal(await page.evaluate(()=>localStorage.getItem('vulcaniq_fast_request')),null);}
    finally{release();if(submissions.length)await finished;await page.unroute('**/api/public/booking-request');}
  });
  await test('Fast Request failure keeps answers and retries with same idempotency key and a fresh challenge',async()=>{
    const submissions=[];await page.route('**/api/public/booking-request',async route=>{submissions.push(route.request().postDataJSON());await route.fulfill({status:submissions.length===1?503:200,contentType:'application/json',body:JSON.stringify(submissions.length===1?{ok:false,code:'synthetic_unavailable'}:{ok:true,id:'11111111-1111-4111-8111-111111111111'})});});
    try{const modal=await readyFastRequest();await modal.getByRole('button',{name:'Send request',exact:true}).click();await modal.locator('.form-status.error').waitFor();await modal.getByRole('button',{name:'Complete synthetic security check'}).click();await modal.getByRole('button',{name:'Send request',exact:true}).click();await modal.locator('.form-status.success').waitFor();assert.equal(submissions.length,2);assert.equal(submissions[0].submission_idempotency_key,submissions[1].submission_idempotency_key);assert.equal(submissions[0].customer_email,submissions[1].customer_email);assert.notEqual(submissions[0].turnstile_token,submissions[1].turnstile_token);}
    finally{await page.unroute('**/api/public/booking-request');}
  });
  await test('booking code challenge blocks missing/expired tokens and double-submit sends one guarded request',async()=>{
    await page.goto(`${base}/audit-harness`);const calls=[];await page.route('**/api/public/booking-code-redeem',async route=>{calls.push(route.request().postDataJSON());await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'BOOKING_CODE_NOT_FOUND',message:'BOOKING_CODE_NOT_FOUND'})});});
    try{
      await page.getByRole('button',{name:'Open booking code'}).click();const modal=page.locator('.booking-code-modal');await modal.locator('#publicBookingCodeInput').fill('SYNTHETIC-CODE');const submit=modal.locator('.booking-code-submit');assert.equal(await submit.isDisabled(),true);await modal.locator('form').evaluate(form=>form.requestSubmit());assert.equal(calls.length,0);
      await modal.getByRole('button',{name:'Complete synthetic security check'}).click();
      await modal.locator('form').evaluate(form=>{window.auditExpireChallenge();form.requestSubmit();});
      // The submit guard must revoke authorization in the callback's same turn;
      // the DOM disabled state is a React render and is awaited separately.
      await modal.getByRole('button',{name:'Retry security check'}).waitFor();await page.waitForFunction(()=>document.querySelector('.booking-code-submit')?.disabled);
      await modal.locator('form').evaluate(form=>form.requestSubmit());assert.equal(calls.length,0,'Expiry must block same-turn and later submissions');
      await modal.getByRole('button',{name:'Retry security check'}).click();await modal.getByRole('button',{name:'Complete synthetic security check'}).click();await modal.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});await modal.locator('.form-status.error').waitFor();assert.equal(calls.length,1);assert.match(calls[0].turnstile_token,/^synthetic-challenge-/);
    }
    finally{await page.unroute('**/api/public/booking-code-redeem');}
  });
  await test('review challenge gates actual form and request carries token without duplicate submission',async()=>{
    await page.goto(`${base}/audit-harness`);const calls=[];await page.route('**/api/public/review',async route=>{calls.push(route.request().postDataJSON());await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({ok:false,code:'INVALID_BOOKING_CODE'})});});
    try{await page.getByRole('button',{name:'Toggle reviews'}).click();await page.getByRole('button',{name:'Publish a review',exact:true}).click();const modal=page.getByRole('dialog',{name:'Publish a review'});await modal.getByLabel('Booking code',{exact:true}).fill('SYNTHETIC-CODE');await modal.getByLabel('Review',{exact:true}).fill('Synthetic review text for local validation.');assert.equal(await modal.getByRole('button',{name:'Publish a review',exact:true}).isDisabled(),true);await modal.locator('form').evaluate(form=>form.requestSubmit());assert.equal(calls.length,0);await modal.getByRole('button',{name:'Complete synthetic security check'}).click();await modal.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});await modal.locator('.admin-alert.error').waitFor();assert.equal(calls.length,1);assert.match(calls[0].turnstile_token,/^synthetic-challenge-/);assert.equal(calls[0].p_booking_code,'SYNTHETIC-CODE');}
    finally{await page.unroute('**/api/public/review');}
  });
  await test('returning to Admin after cross-tab sign-out clears private content without reload',async()=>{
    const user={id:'22222222-2222-4222-8222-222222222222',email:'synthetic-owner@example.invalid',aud:'authenticated',role:'authenticated'};
    await context.route('**/auth/v1/user',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(user),headers:{'access-control-allow-origin':'*'}}));
    await context.route('**/rest/v1/admin_profiles?**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({user_id:user.id,active:true,role:'owner',full_name:'Synthetic Owner'}),headers:{'access-control-allow-origin':'*'}}));
    await context.route('**/auth/v1/logout?**',route=>route.fulfill({status:204}));
    await page.evaluate(async user=>{
      const {supabase}=await import('/src/lib/supabaseClient.js');
      const jwt=[btoa(JSON.stringify({alg:'HS256',typ:'JWT'})),btoa(JSON.stringify({sub:user.id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})),btoa('synthetic-test-signature')].map(value=>value.replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')).join('.');
      const {error}=await supabase.auth.setSession({access_token:jwt,refresh_token:'synthetic-refresh-token'});if(error)throw error;
    },user);
    await page.goto(`${base}/admin/account?lang=en`);
    await page.getByText(user.email,{exact:true}).waitFor();assert.equal(await page.locator('.admin-account-page').count(),1);
    await page.evaluate(async()=>{const {supabase}=await import('/src/lib/supabaseClient.js');window.auditAuthEvents=[];supabase.auth.onAuthStateChange((event,session)=>window.auditAuthEvents.push({event,hasSession:Boolean(session)}));});
    const second=await context.newPage();try{
      await second.goto(`${base}/audit-harness`);
      await second.evaluate(async()=>{const {supabase}=await import('/src/lib/supabaseClient.js');const{error}=await supabase.auth.signOut({scope:'local'});if(error)throw error;});
      // Returning to the tab models the real visibility/focus boundary. Chrome
      // may defer React painting while the signed-out tab is in the background.
      await page.bringToFront();
      await page.waitForFunction(()=>!document.querySelector('.admin-account-page'),null,{polling:50,timeout:15000});
      assert.ok((await page.evaluate(()=>window.auditAuthEvents)).some(item=>item.event==='SIGNED_OUT'&&!item.hasSession));
      await page.locator('.admin-login-card').waitFor();assert.equal(await page.getByText(user.email,{exact:true}).count(),0);
    }finally{await second.close();}
  });
} finally { await browser.close(); }
console.log(`${passed} passed, ${failures.length} failed; every external request was intercepted (${external.length}).`);
if (failures.length) process.exitCode=1;

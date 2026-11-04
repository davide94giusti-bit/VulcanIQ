import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { onRequest, processPersonalizedEvent } from '../functions/api/notifications/[[path]].js';
import { notificationEntityRef } from '../functions/api/notifications/_ownership.js';
import { validPushEndpoint, validatePushSubscription, claimRate, reservePush } from '../shared/notificationPolicy.js';
import { deliverEvent, invocationBudget } from '../shared/notificationDelivery.js';
import { processAutomationJobs } from '../workers/notifications/src/index.js';
import { sendWebPush } from '../shared/webPush.js';
import { isolatedOutboxConfig, reconcileOutbox } from '../shared/notificationOutbox.js';
import { notificationRetention } from '../shared/notificationRetention.js';
import { notificationDatabase,notificationFetch,runtimeBudget } from '../shared/notificationRuntime.js';
const tests=[];const test=(name,run)=>tests.push([name,run]);
function database(){
  const sqlite=new DatabaseSync(':memory:');
  for(const file of fs.readdirSync('workers/notifications/migrations').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(`workers/notifications/migrations/${file}`,'utf8'));
  const wrapper={sqlite,prepare(sql){return {bind(...args){return wrapper.statement(sql,args);},...wrapper.statement(sql,[])};},statement(sql,args){return {async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){const result=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}};},async batch(queries){sqlite.exec('BEGIN');try{const result=[];for(const query of queries)result.push(await query.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};return wrapper;
}
const old='2020-01-01T00:00:00.000Z';
function seed(db,id='s1',categories=['news']){
  db.sqlite.prepare('INSERT INTO notification_subscriptions(id,audience,app_variant,device_id,device_token_hash,endpoint,created_at,updated_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,'public','public',`device-${id}`,'h',`inapp://public/${id}`,old,old,old);
  db.sqlite.prepare('INSERT INTO notification_preferences(subscription_id,categories_json,updated_at) VALUES(?,?,?)').run(id,JSON.stringify(categories),old);
}
function event(db,extras={}){
  const value={id:'e1',audience:'public',category:'news',origin:'test',title_it:'Prova',title_en:'Test',body_it:'Prova testo',body_en:'Test body',destination_url:'/install',dedupe_key:'d1',priority:'normal',created_at:new Date().toISOString(),status:'sending',...extras};
  const keys=Object.keys(value);db.sqlite.prepare(`INSERT INTO notification_events(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...Object.values(value));return value;
}
function request(route,token='a'.repeat(64),value={}){const req=new Request(`https://local.test/api/notifications/${route}`,{method:'POST',headers:{'X-Notification-Device':'device-00000000000001','X-Notification-Token':token,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(value)});Object.defineProperty(req,'cf',{value:{colo:'TEST'}});return req;}
const env=db=>({NOTIFICATIONS_DB:db,NOTIFICATION_RATE_HASH_SECRET:'synthetic-only-test-key',NOTIFICATION_INVOCATION_BUDGET:invocationBudget()});
test('device collision wrong token on device and subscribe performs zero DB writes; owner retains identity',async()=>{
  const db=database(),settings=env(db);assert.equal((await onRequest({request:request('device'),env:settings})).status,201);
  const before=db.sqlite.prepare('SELECT total_changes() AS n').get().n;
  for(const route of ['device','subscribe'])assert.equal((await onRequest({request:request(route,'b'.repeat(64)),env:settings})).status,409);
  assert.equal(db.sqlite.prepare('SELECT total_changes() AS n').get().n,before);
  assert.equal((await onRequest({request:request('device'),env:settings})).status,201);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_subscriptions').get().n,1);db.sqlite.close();
});
test('concurrent registration cannot replace winner credential',async()=>{
  const db=database(),settings=env(db);const result=await Promise.all(['a','b'].map(c=>onRequest({request:request('device',c.repeat(64)),env:settings})));
  assert.deepEqual(result.map(r=>r.status).sort(),[201,409]);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_subscriptions').get().n,1);db.sqlite.close();
});
test('atomic threshold and daily reservation reject concurrent excess',async()=>{
  const db=database();assert.equal((await Promise.all(Array.from({length:30},()=>claimRate(db,'k',10,60)))).filter(Boolean).length,10);
  assert.equal((await Promise.all(Array.from({length:30},()=>reservePush(db,{NOTIFICATION_PUBLIC_DAILY_SEND_CAP:7})))).filter(Boolean).length,7);db.sqlite.close();
});
test('anonymous enrollment fails closed without trusted edge context and does not trust forwarded IP',async()=>{
  const db=database(),req=new Request('https://local.test/api/notifications/device',{method:'POST',headers:{'X-Notification-Device':'device-00000000000001','X-Notification-Token':'a'.repeat(64),'CF-Connecting-IP':'192.0.2.1'},body:'{}'});
  assert.equal((await onRequest({request:req,env:env(db)})).status,503);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_subscriptions').get().n,0);db.sqlite.close();
});
test('provider host boundaries block arbitrary encoded credentials and IP URLs',async()=>{
  for(const url of ['https://fcm.googleapis.com/fcm/send/token','https://fcm.googleapis.com/wp/token','https://updates.push.services.mozilla.com/wpush/v2/token','https://web.push.apple.com/token'])assert.ok(validPushEndpoint(url));
  for(const url of ['https://evil.test/x','https://fcm.googleapis.com.evil.test/fcm/send/a','https://user@fcm.googleapis.com/fcm/send/a','https://%66cm.googleapis.com/fcm/send/a','https://127.0.0.1/x','https://[::1]/x','https://fcm.googleapis.com:444/wp/a','https://fcm.googleapis.com/other'])assert.equal(validPushEndpoint(url),false,url);
  assert.equal(await validatePushSubscription({endpoint:'https://fcm.googleapis.com/wp/a',p256dh:'a',auth:'a'}),false);
});
test('invalid push destination or key produces zero fetches',async()=>{
  const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected');};
  try{assert.equal((await sendWebPush({endpoint:'https://evil.test/x'})).accepted,false);assert.equal((await sendWebPush({endpoint:'https://fcm.googleapis.com/wp/a',p256dh:'a',auth:'a'})).accepted,false);assert.equal(calls,0);}finally{globalThis.fetch=previous;}
});
for(const count of [0,1,250,251,1000])test(`resumable ${count} recipient fanout completes without loss or duplicate inbox`,async()=>{
  const db=database();for(let n=0;n<count;n++)seed(db,`s${String(n).padStart(4,'0')}`);const ev=event(db);let result,iterations=0;
  do{result=await deliverEvent(db,env(db),ev);assert.ok(++iterations<100);}while(!result.complete);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_inbox').get().n,count);
  await deliverEvent(db,env(db),ev);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_inbox').get().n,count);db.sqlite.close();
});
test('sole eligible recipient at position 251 is not lost',async()=>{
  const db=database();for(let n=0;n<251;n++)seed(db,`s${String(n).padStart(4,'0')}`,n===250?['news']:[]);const ev=event(db);let result;do{result=await deliverEvent(db,env(db),ev);}while(!result.complete);
  assert.equal(db.sqlite.prepare('SELECT subscription_id FROM notification_inbox').get().subscription_id,'s0250');db.sqlite.close();
});
test('queued reminder after opt-out writes neither inbox nor push',async()=>{
  const db=database();seed(db);
  db.sqlite.prepare("INSERT INTO notification_ownership_claims(id,token_hash,entity_ref,entity_type,journey_type,status,claimed_subscription_id,expires_at,created_at) VALUES('c',? ,?,'booking_request','booking','claimed','s1','2099-01-01',?)").run('a'.repeat(64),'e'.repeat(64),old);
  db.sqlite.prepare("INSERT INTO notification_subscription_ownership(id,claim_id,subscription_id,entity_type,entity_ref,journey_type,verified_at,created_at,reminders_enabled) VALUES('o','c','s1','booking_request',?,'booking',?,?,0)").run('e'.repeat(64),old,old);
  db.sqlite.prepare("INSERT INTO notification_jobs(id,source_type,source_id,recipient_subscription_id,audience,category,title_it,body_it,title_en,body_en,scheduled_for,dedupe_key,created_at,ownership_id) VALUES('j','owned_journey','b','s1','public','customer_upcoming_reminder','t','b','t','b',?,'j',?,'o')").run(old,old);
  const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected');};
  try{await processAutomationJobs(db,env(db));assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_inbox').get().n,0);assert.equal(calls,0);assert.equal(db.sqlite.prepare('SELECT status FROM notification_jobs').get().status,'cancelled');}finally{globalThis.fetch=previous;db.sqlite.close();}
});
test('expired pre-send lease recovers; expired sending lease is unknown, never resent',async()=>{
  const db=database();seed(db,'s1');seed(db,'s2');const ev=event(db,{fanout_complete:1});
  for(const [id,state] of [['s1','leased'],['s2','sending']])db.sqlite.prepare('INSERT INTO notification_recipient_deliveries(event_id,subscription_id,state,lease_token,lease_expires_at,updated_at) VALUES(?,?,?,?,?,?)').run('e1',id,state,'stale',old,old);
  const result=await deliverEvent(db,env(db),ev);assert.equal(result.complete,true);assert.equal(result.counts.unknown,1);assert.equal(result.counts.inapp_only,1);
  assert.equal(db.sqlite.prepare("UPDATE notification_recipient_deliveries SET state='accepted' WHERE lease_token='stale'").run().changes,0);db.sqlite.close();
});
test('outbox activation is disabled and mismatched Preview backend rejected',async()=>{
  assert.equal(isolatedOutboxConfig({}),null);
  assert.throws(()=>isolatedOutboxConfig({NOTIFICATION_OUTBOX_ENABLED:'true',SUPABASE_URL:'https://production.test',SUPABASE_SECRET_KEY:'sb_secret_fixture',NOTIFICATION_EXPECTED_SUPABASE_URL:'https://preview.test'}));
  assert.deepEqual(await reconcileOutbox(null,{},()=>{throw Error('must not run');}),{disabled:true,processed:0,items:[]});
});
async function pushFixture(){
  const vapid=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const user=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const b64=bytes=>Buffer.from(bytes).toString('base64url');
  return{subscription:{endpoint:'https://fcm.googleapis.com/wp/synthetic',p256dh:b64(await crypto.subtle.exportKey('raw',user.publicKey)),auth:b64(new Uint8Array(16))},config:{VAPID_PUBLIC_KEY:b64(await crypto.subtle.exportKey('raw',vapid.publicKey)),VAPID_PRIVATE_KEY:(await crypto.subtle.exportKey('jwk',vapid.privateKey)).d}};
}

// Use real publication + Worker dispatch against the migrated SQLite schema.
// Backend rows/providers are synthetic; the pending outbox is deliberately NOT
// drained, so suppression must come from current authority, not publication order.
async function withQueuedReminder(run,{legacy=false,unlinked=false}={}) {
  const db=database(),fixture=await pushFixture(),RealDate=globalThis.Date,previousFetch=globalThis.fetch;
  let clock=RealDate.parse('2030-04-01T10:00:00.000Z');
  globalThis.Date=class extends RealDate { constructor(...args){super(...(args.length?args:[clock]));} static now(){return clock;} };
  const state={booking:{id:'11111111-1111-4111-8111-111111111111',status:'accepted',lead_status:'confirmed',experience_id:'etna-learning',requested_date:'2030-04-03',fixed_excursion_id:'22222222-2222-4222-8222-222222222222',confirmed_at:'2030-03-30T10:00:00Z',updated_at:'2030-03-30T10:00:00Z'},activity:{id:'22222222-2222-4222-8222-222222222222',date:'2030-04-03',start_time:'10:00:00',experience_id:'etna-learning',status:'available',active:true,updated_at:'2030-03-30T10:00:00Z'},outbox:[{status:'pending',event_type:'operational_change'}],unavailable:false,reads:0,pushes:0,outboxReads:0};
  if(unlinked){state.booking.fixed_excursion_id=null;state.activity=null;}
  const settings={...env(db),...fixture.config,SUPABASE_URL:'https://backend.test',SUPABASE_SECRET_KEY:'sb_secret_fixture'};
  globalThis.fetch=async input=>{
    const url=new URL(String(input));
    if(url.hostname==='fcm.googleapis.com'){state.pushes++;return new Response(null,{status:201});}
    if(url.pathname.endsWith('/customer_notification_outbox')){state.outboxReads++;return Response.json(state.outbox);}
    if(!['/rest/v1/booking_requests','/rest/v1/fixed_excursions'].includes(url.pathname))throw Error(`Unexpected synthetic request: ${url.pathname}`);
    state.reads++;if(state.unavailable)return new Response(null,{status:503});
    if(state.malformed)return Response.json({unexpected:'not a canonical row array'});
    const row=url.pathname.endsWith('/booking_requests')?state.booking:state.activity;
    return Response.json(row?[row]:[]);
  };
  try {
    seed(db);db.sqlite.prepare('UPDATE notification_subscriptions SET endpoint=?,p256dh=?,auth=?').run(fixture.subscription.endpoint,fixture.subscription.p256dh,fixture.subscription.auth);
    const entityRef=await notificationEntityRef('booking_request',state.booking.id);
    db.sqlite.prepare("INSERT INTO notification_ownership_claims(id,token_hash,entity_ref,entity_type,journey_type,status,claimed_subscription_id,expires_at,created_at) VALUES('c',?,?,'booking_request','booking','claimed','s1','2099-01-01',?)").run('a'.repeat(64),entityRef,old);
    db.sqlite.prepare("INSERT INTO notification_subscription_ownership(id,claim_id,subscription_id,entity_type,entity_ref,journey_type,verified_at,created_at) VALUES('o','c','s1','booking_request',?,'booking',?,?)").run(entityRef,old,old);
    db.sqlite.prepare("UPDATE notification_automation_rules SET enabled=1 WHERE rule_key IN ('customer_booking_confirmed','customer_upcoming_reminder')").run();
    const publish=type=>processPersonalizedEvent(db,settings,{url:settings.SUPABASE_URL,backendCredential:{key:settings.SUPABASE_SECRET_KEY,kind:'secret'},env:settings},'synthetic-owner','booking_request',state.booking.id,type);
    const result=await publish('booking_confirmed');
    assert.equal(result.ok,true);assert.equal(result.jobCount,2);
    // Isolate the scheduled reminder, not the immediate confirmation.
    db.sqlite.prepare("UPDATE notification_jobs SET status='sent' WHERE category<>'customer_upcoming_reminder'").run();
    // Reconstruct the exact pre-fix job contract, which inherited the originating
    // confirmation revision rather than capturing a reminder-specific snapshot.
    if(legacy)db.sqlite.prepare("UPDATE notification_jobs SET canonical_event_type='booking_confirmed',source_revision=(SELECT source_revision FROM notification_personalized_events LIMIT 1) WHERE category='customer_upcoming_reminder'").run();
    const job=()=>db.sqlite.prepare("SELECT * FROM notification_jobs WHERE category='customer_upcoming_reminder'").get();
    clock=RealDate.parse(job().scheduled_for)+1000;
    const dispatch=()=>processAutomationJobs(db,{...settings,NOTIFICATION_INVOCATION_BUDGET:invocationBudget()});
    await run({db,state,job,dispatch,publish,advance:iso=>{clock=RealDate.parse(iso);}});
    assert.equal(state.outboxReads,0);assert.equal(state.outbox[0].status,'pending');
  } finally {globalThis.Date=RealDate;globalThis.fetch=previousFetch;db.sqlite.close();}
}

for(const legacy of [false,true])for(const [label,mutate] of [
  ['activity date changed',({state})=>{state.activity.date='2030-04-04';}],
  ['activity time changed',({state})=>{state.activity.start_time='12:00:00';}],
  ['activity disabled',({state})=>{state.activity.active=false;}],
  ['activity cancelled',({state})=>{state.activity.status='cancelled';}],
  ['booking cancelled with confirmed lead',({state})=>{state.booking.status='cancelled';}],
  ['accepted booking with cancelled lead',({state})=>{state.booking.lead_status='cancelled';}],
  ['accepted booking with lost lead',({state})=>{state.booking.lead_status='lost';}],
  ['accepted booking already completed',({state})=>{state.booking.lead_status='completed';}],
  ['archived booking with confirmed lead',({state})=>{state.booking.status='archived';}],
  ['linked activity missing',({state})=>{state.activity=null;}],
  ['rule offset changed',({db})=>{db.sqlite.prepare("UPDATE notification_automation_rules SET offset_minutes=-60 WHERE rule_key='customer_upcoming_reminder'").run();}]
])test(`${legacy?'legacy':'new'} confirmation-derived reminder suppressed when ${label}, even with pending outbox`,()=>withQueuedReminder(async context=>{
  mutate(context);await context.dispatch();
  assert.equal(context.db.sqlite.prepare('SELECT count(*) n FROM notification_inbox').get().n,0);
  assert.equal(context.state.pushes,0);assert.equal(context.job().status,'cancelled');
},{legacy}));

for(const legacy of [false,true])test(`unchanged eligible ${legacy?'legacy':'new'} confirmation-derived reminder still writes one inbox and one push`,()=>withQueuedReminder(async({db,state,job,dispatch})=>{
  await dispatch();await dispatch();assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_inbox').get().n,1);
  assert.equal(state.pushes,1);assert.equal(job().status,'sent');
},{legacy}));

for(const unlinked of [false,true])test(`unrelated update preserves eligible ${unlinked?'unlinked':'linked'} booking reminder`,()=>withQueuedReminder(async({db,state,job,dispatch})=>{
  state.booking.updated_at=new Date().toISOString();if(state.activity)state.activity.updated_at=new Date().toISOString();
  await dispatch();assert.equal(job().status,'sent');assert.equal(state.pushes,1);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_inbox').get().n,1);
},{unlinked}));

test('unlinked requested-date change suppresses the old reminder',()=>withQueuedReminder(async({db,state,job,dispatch})=>{
  state.booking.requested_date='2030-04-04';await dispatch();assert.equal(job().status,'cancelled');assert.equal(state.pushes,0);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_inbox').get().n,0);
},{unlinked:true}));

test('unavailable reminder authority fails closed with bounded retry and backoff',()=>withQueuedReminder(async({db,state,job,dispatch,advance})=>{
  state.unavailable=true;
  for(let attempt=1;attempt<=job().max_attempts;attempt++){
    await dispatch();const current=job();assert.equal(current.attempt_count,attempt);
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_inbox').get().n,0);assert.equal(state.pushes,0);
    if(attempt<current.max_attempts){assert.equal(current.status,'scheduled');assert.ok(Date.parse(current.next_attempt_at)>Date.now());
      const reads=state.reads;await dispatch();assert.equal(state.reads,reads);advance(current.next_attempt_at);
    }else{assert.equal(current.status,'failed');assert.equal(current.terminal_reason,'canonical_validation_exhausted');}
  }
}));

test('malformed reminder authority is retryable, and recovered authority delivers once',()=>withQueuedReminder(async({db,state,job,dispatch,advance})=>{
  state.malformed=true;await dispatch();assert.equal(job().status,'scheduled');assert.equal(job().attempt_count,1);assert.ok(job().next_attempt_at);
  assert.equal(state.pushes,0);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_inbox').get().n,0);
  state.malformed=false;advance(job().next_attempt_at);await dispatch();await dispatch();assert.equal(job().status,'sent');assert.equal(state.pushes,1);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_inbox').get().n,1);
}));

test('stale automation due-row reader cannot bypass canonical validation backoff',()=>withQueuedReminder(async({db,state,job,dispatch})=>{
  state.unavailable=true;const prepare=db.prepare.bind(db);let interleave=true;
  db.prepare=sql=>{
    const statement=prepare(sql);
    if(sql.startsWith("UPDATE notification_jobs SET status='processing'"))return{bind(...args){const bound=statement.bind(...args);return{async first(){
      if(interleave){interleave=false;await dispatch();}return bound.first();
    }};}};
    return statement;
  };
  const reads=state.reads;await dispatch();assert.equal(state.reads,reads+1);assert.equal(job().attempt_count,1);assert.ok(Date.parse(job().next_attempt_at)>Date.now());
  assert.equal(state.pushes,0);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_inbox').get().n,0);
}));

for(const [label,change,eventType,expected] of [
  ['rescheduled activity',state=>{state.activity.date='2030-04-04';},'operational_change',1],
  ['disabled activity',state=>{state.activity.active=false;},'operational_change',0],
  ['cancelled booking',state=>{state.booking.lead_status='cancelled';},'booking_cancelled',0]
])test(`publication of ${label} supersedes old reminder and creates ${expected} replacement`,()=>withQueuedReminder(async({db,state,job,publish})=>{
  const original=job().id;change(state);state.activity.updated_at=new Date().toISOString();state.booking.updated_at=new Date().toISOString();
  db.sqlite.prepare('UPDATE notification_automation_rules SET enabled=1 WHERE rule_key=?').run('customer_'+eventType);
  assert.equal((await publish(eventType)).ok,true);
  assert.equal(db.sqlite.prepare('SELECT status FROM notification_jobs WHERE id=?').get(original).status,'cancelled');
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM notification_jobs WHERE category='customer_upcoming_reminder' AND status='scheduled'").get().n,expected);
  assert.equal(state.pushes,0);
}));
test('encrypted provider transport bounds redirect timeout and classifies 410/429/500/unknown',async()=>{
  const fixture=await pushFixture(),previous=globalThis.fetch;let calls=0;
  try{for(const status of [201,302,410,429,500,0]){
    globalThis.fetch=async(_url,options)=>{calls++;assert.equal(options.redirect,'manual');assert.ok(options.signal);if(!status)throw new DOMException('timeout','AbortError');return new Response(null,{status,headers:{'Retry-After':'120',Location:'https://evil.test'}});};
    const result=await sendWebPush(fixture.subscription,fixture.config);
    assert.equal(result.accepted,status===201);assert.equal(result.dead,status===410);assert.equal(result.retryable,[429,500].includes(status));assert.equal(result.unknown,status===0);
  }assert.equal(calls,6);}finally{globalThis.fetch=previous;}
});
test('expired runner cannot send or overwrite reclaimed delivery',async()=>{
  const fixture=await pushFixture(),db=database();seed(db);db.sqlite.prepare('UPDATE notification_subscriptions SET endpoint=?,p256dh=?,auth=?').run(fixture.subscription.endpoint,fixture.subscription.p256dh,fixture.subscription.auth);const ev=event(db);
  const prepare=db.prepare.bind(db);db.prepare=sql=>{
    const statement=prepare(sql);
    if(sql.startsWith("UPDATE notification_recipient_deliveries SET state='sending'"))return{bind(...args){db.sqlite.prepare("UPDATE notification_recipient_deliveries SET lease_token='new-runner',state='accepted'").run();return statement.bind(...args);}};
    return statement;
  };
  const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response(null,{status:201});};
  try{await deliverEvent(db,{...env(db),...fixture.config},ev);assert.equal(calls,0);assert.equal(db.sqlite.prepare('SELECT state FROM notification_recipient_deliveries').get().state,'accepted');}finally{globalThis.fetch=previous;db.sqlite.close();}
});
test('stale due-row reader cannot reclaim a retry rescheduled by another runner',async()=>{
  const fixture=await pushFixture(),db=database();seed(db);db.sqlite.prepare('UPDATE notification_subscriptions SET endpoint=?,p256dh=?,auth=?').run(fixture.subscription.endpoint,fixture.subscription.p256dh,fixture.subscription.auth);const ev=event(db);
  const prepare=db.prepare.bind(db);let interleave=true,winningResult;
  db.prepare=sql=>{
    const statement=prepare(sql);
    if(sql.startsWith("UPDATE notification_recipient_deliveries SET state='leased'"))return{bind(...args){const bound=statement.bind(...args);return{async first(){
      if(interleave){interleave=false;winningResult=await deliverEvent(db,{...env(db),...fixture.config},ev);}
      return bound.first();
    }};}};
    return statement;
  };
  const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response(null,{status:429,headers:{'Retry-After':'3600'}});};
  try{
    const staleResult=await deliverEvent(db,{...env(db),...fixture.config},ev);
    assert.equal(winningResult.attempted,1);assert.equal(staleResult.attempted,0);assert.equal(staleResult.complete,false);assert.equal(calls,1);
    const receipt=db.sqlite.prepare('SELECT state,attempt_count,next_attempt_at FROM notification_recipient_deliveries').get();assert.equal(receipt.state,'retry');assert.equal(receipt.attempt_count,1);assert.ok(Date.parse(receipt.next_attempt_at)>Date.now()+3500000);
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_inbox').get().n,1);
  }finally{globalThis.fetch=previous;db.sqlite.close();}
});

test('accepted then D1 failure is unknown on recovery and never automatically replayed',async()=>{
  const fixture=await pushFixture(),db=database();seed(db);db.sqlite.prepare('UPDATE notification_subscriptions SET endpoint=?,p256dh=?,auth=?').run(fixture.subscription.endpoint,fixture.subscription.p256dh,fixture.subscription.auth);const ev=event(db);
  const prepare=db.prepare.bind(db);let inject=true;db.prepare=sql=>{const statement=prepare(sql);if(inject&&sql.startsWith('UPDATE notification_recipient_deliveries SET state=?,reason='))return{bind(...args){if(args[0]==='accepted')return{async run(){throw Error('synthetic status write failure');}};return statement.bind(...args);}};return statement;};
  const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response(null,{status:201});};
  try{await assert.rejects(()=>deliverEvent(db,{...env(db),...fixture.config},ev));inject=false;db.sqlite.prepare('UPDATE notification_recipient_deliveries SET lease_expires_at=?').run(old);const result=await deliverEvent(db,{...env(db),...fixture.config},ev);assert.equal(result.counts.unknown,1);assert.equal(calls,1);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_inbox').get().n,1);}finally{globalThis.fetch=previous;db.sqlite.close();}
});
test('one invocation shares actual fetch and D1 ceilings',async()=>{
  const db=database(),budget=runtimeBudget();budget.maxD1=2;const wrapped=notificationDatabase(db,budget);await wrapped.prepare('SELECT 1').first();await wrapped.prepare('SELECT 1').first();await assert.rejects(()=>wrapped.prepare('SELECT 1').first(),/invocation_budget/);
  const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('{}');};
  try{const settings={NOTIFICATION_RUNTIME_BUDGET:{...runtimeBudget(),maxExternal:2}};await notificationFetch(settings,'https://mock.invalid');await notificationFetch(settings,'https://mock.invalid');await assert.rejects(()=>notificationFetch(settings,'https://mock.invalid'),/invocation_budget/);assert.equal(calls,2);}finally{globalThis.fetch=previous;db.sqlite.close();}
});
test('forget device is owned, cascades credentials and inbox, and is replay-safe',async()=>{
  const db=database(),settings=env(db);await onRequest({request:request('device'),env:settings});const sub=db.sqlite.prepare('SELECT id FROM notification_subscriptions').get();
  db.sqlite.prepare("INSERT INTO notification_inbox(id,subscription_id,audience,category,title,body,created_at) VALUES('i',?,'public','news','t','b',?)").run(sub.id,old);
  assert.equal((await onRequest({request:request('forget-device','b'.repeat(64)),env:settings})).status,404);
  assert.equal((await onRequest({request:request('forget-device'),env:settings})).status,200);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_inbox').get().n,0);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_preferences').get().n,0);assert.equal((await onRequest({request:request('forget-device'),env:settings})).status,404);db.sqlite.close();
});
test('retention is dry-run by default, bounded and preserves active identities',async()=>{
  const db=database();seed(db);for(let n=0;n<120;n++)db.sqlite.prepare('INSERT INTO notification_rate_limits(rate_key,window_started_at,hits) VALUES(?,?,1)').run('r'+n,old);
  assert.equal((await notificationRetention(db)).counts.rateLimits,100);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_rate_limits').get().n,120);
  await notificationRetention(db,{dryRun:false,enabled:true});assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_rate_limits').get().n,20);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_subscriptions').get().n,1);db.sqlite.close();
});
test('trusted ingest persists event and continuation atomically before delivery and replay dedupes',async()=>{
  const db=database(),settings={...env(db),NOTIFICATION_INGEST_SECRET:'synthetic-ingest-secret'};
  const call=()=>onRequest({env:settings,request:new Request('https://local.test/api/notifications/ingest',{method:'POST',headers:{'X-Notification-Ingest-Key':'synthetic-ingest-secret','Content-Type':'application/json'},body:JSON.stringify({category:'new_bookings',dedupeKey:'synthetic-request'})})});
  const statement=db.statement.bind(db);let fail=true;
  db.statement=(sql,args)=>{const result=statement(sql,args);if(fail&&sql.startsWith('INSERT OR IGNORE INTO notification_jobs'))return {...result,async run(){throw Error('synthetic interrupted atomic insert');}};return result;};
  assert.equal((await call()).status,500);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_events').get().n,0);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_jobs').get().n,0);
  fail=false;assert.equal((await call()).status,202);const job=db.sqlite.prepare('SELECT * FROM notification_jobs').get();assert.ok(job.lease_token);assert.ok(job.lease_expires_at);assert.equal(job.status,'sent');
  assert.equal((await call()).status,200);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_jobs').get().n,1);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_events').get().n,1);db.sqlite.close();
});
test('Pages ingest stale lease cannot finalize a job reclaimed by another runner',async()=>{
  const db=database(),settings={...env(db),NOTIFICATION_INGEST_SECRET:'synthetic-ingest-secret'},prepare=db.prepare.bind(db);
  db.prepare=sql=>{const result=prepare(sql);if(sql.startsWith('UPDATE notification_jobs SET status=?,sent_at='))return{bind(...args){db.sqlite.prepare("UPDATE notification_jobs SET lease_token='new-runner',status='processing'").run();return result.bind(...args);}};return result;};
  const response=await onRequest({env:settings,request:new Request('https://local.test/api/notifications/ingest',{method:'POST',headers:{'X-Notification-Ingest-Key':'synthetic-ingest-secret','Content-Type':'application/json'},body:JSON.stringify({category:'new_bookings',dedupeKey:'synthetic-lease'})})});
  assert.equal(response.status,202);assert.equal(db.sqlite.prepare('SELECT status FROM notification_jobs').get().status,'processing');assert.equal(db.sqlite.prepare('SELECT lease_token FROM notification_jobs').get().lease_token,'new-runner');db.sqlite.close();
});
test('campaign draft reload/edit/publish uses state and version CAS; overlength rejected',async()=>{
  const db=database(),settings={...env(db),SUPABASE_URL:'https://backend.test',SUPABASE_ANON_KEY:'public-fixture',SUPABASE_SECRET_KEY:'sb_secret_fixture'},previous=globalThis.fetch;
  globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('/auth/')?{id:'owner-fixture'}:[{user_id:'owner-fixture',role:'owner',active:true}]));
  const call=async(path,method,value)=>onRequest({env:settings,request:new Request('https://local.test/api/notifications/'+path,{method,headers:{Authorization:'Bearer synthetic-user','Content-Type':'application/json'},body:method==='GET'?undefined:JSON.stringify(value)})});
  const form={category:'news',titleIt:'Titolo',titleEn:'Title',bodyIt:'Testo',bodyEn:'Body',languageTarget:'all',destinationUrl:'/install',saveDraft:true};
  try{assert.equal((await call('campaigns','POST',{...form,titleIt:'x'.repeat(121)})).status,400);const created=await (await call('campaigns','POST',form)).json();const rows=await (await call('campaigns','GET')).json();const item=rows.items[0];assert.equal(item.body_en,'Body');
    assert.equal((await call('campaigns/'+created.id,'PATCH',{...form,updatedAt:item.updated_at,saveDraft:false})).status,200);
    assert.equal((await call('campaigns/'+created.id,'PATCH',{...form,updatedAt:item.updated_at})).status,409);
    assert.equal(db.sqlite.prepare('SELECT status FROM notification_campaigns').get().status,'queued');
    const immediate=await(await call('campaigns','POST',{...form,saveDraft:false})).json();assert.equal(immediate.status,'sent');const sent=db.sqlite.prepare('SELECT lease_token,lease_expires_at FROM notification_campaigns WHERE id=?').get(immediate.id);assert.ok(sent.lease_token);assert.ok(sent.lease_expires_at);
  }finally{globalThis.fetch=previous;db.sqlite.close();}
});
let failed=0;for(const [name,run] of tests){try{await run();console.log(`PASS ${name}`);}catch(e){failed++;console.error(`FAIL ${name}: ${e.stack}`);}}
console.log(`Notification behavior: ${tests.length-failed} passed, ${failed} failed`);process.exitCode=failed?1:0;

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { processAutomationJobs } from '../workers/notifications/src/index.js';
import { onRequest } from '../functions/api/notifications/[[path]].js';
import { issueNotificationOwnershipClaim, sha256Hex } from '../functions/api/notifications/_ownership.js';
const tests=[];const test=(name,run)=>tests.push([name,run]);
const directory='workers/notifications/migrations';
const files=fs.readdirSync(directory).filter(f=>f.endsWith('.sql')).sort();
function database(list=files){
  const sqlite=new DatabaseSync(':memory:');
  for(const file of list)sqlite.exec(fs.readFileSync(`${directory}/${file}`,'utf8'));
  const db={sqlite,prepare(sql){return {bind(...args){return db.statement(sql,args);},...db.statement(sql,[])};},statement(sql,args){return {async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};},async batch(queries){sqlite.exec('BEGIN');try{const results=[];for(const query of queries)results.push(await query.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};return db;
}
const entityId='20000000-0000-4000-8000-000000000001';
const request=(path,value={},token='a'.repeat(64),device='device-00000000000001')=>new Request(`https://local.test/api/notifications/${path}`,{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1','X-Notification-Device':device,'X-Notification-Token':token},body:JSON.stringify(value)});
async function device(db){
  const req=request('device');Object.defineProperty(req,'cf',{value:{colo:'TEST'}});
  const settings={NOTIFICATIONS_DB:db,NOTIFICATION_RATE_HASH_SECRET:'synthetic-local-only-test-key'};
  assert.equal((await onRequest({request:req,env:settings})).status,201);return settings;
}
test('D1 migration prefixes are unique after reconciling deployed history',()=>assert.equal(new Set(files.map(f=>f.split('_')[0])).size,files.length));
for(const baseline of [5,7])test(`recorded D1 baseline ${baseline} upgrades without changing existing device or consent data`,()=>{
  const db=database(files.slice(0,baseline));
  const now='2026-09-01T00:00:00.000Z';
  db.sqlite.prepare("INSERT INTO notification_subscriptions(id,audience,app_variant,device_id,device_token_hash,endpoint,created_at,updated_at,last_seen_at) VALUES('retained','public','public','retained-device','hash','inapp://retained',?,?,?)").run(now,now,now);
  db.sqlite.prepare("INSERT INTO notification_preferences(subscription_id,categories_json,updated_at) VALUES('retained','[]',?)").run(now);
  db.sqlite.prepare("INSERT INTO notification_ownership_claims(id,token_hash,entity_type,entity_ref,journey_type,status,claimed_subscription_id,expires_at,created_at) VALUES('retained-claim',?,'booking_request',?,'booking','claimed','retained','2099-01-01T00:00:00Z',?)").run('c'.repeat(64),'e'.repeat(64),now);
  db.sqlite.prepare("INSERT INTO notification_subscription_ownership(id,claim_id,subscription_id,entity_type,entity_ref,journey_type,verified_at,created_at,reminders_enabled) VALUES('retained-owner','retained-claim','retained','booking_request',?,'booking',?,?,0)").run('e'.repeat(64),now,now);
  if(baseline===7){
    db.sqlite.prepare("UPDATE notification_ownership_claims SET entity_id=? WHERE id='retained-claim'").run(entityId);
    db.sqlite.prepare("UPDATE notification_subscription_ownership SET entity_id=?,terms_reminder_checked_at=? WHERE id='retained-owner'").run(entityId,now);
  }
  const ownershipBefore=db.sqlite.prepare("SELECT * FROM notification_subscription_ownership WHERE id='retained-owner'").get();
  const before=JSON.stringify(db.sqlite.prepare("SELECT * FROM notification_subscriptions WHERE id='retained'").get());
  for(const file of files.slice(baseline))db.sqlite.exec(fs.readFileSync(`${directory}/${file}`,'utf8'));
  assert.equal(JSON.stringify(db.sqlite.prepare("SELECT * FROM notification_subscriptions WHERE id='retained'").get()),before);
  assert.equal(db.sqlite.prepare("SELECT categories_json FROM notification_preferences WHERE subscription_id='retained'").get().categories_json,'[]');
  assert.ok(db.sqlite.prepare("SELECT name FROM pragma_table_info('notification_subscription_ownership') WHERE name='entity_id'").get());
  const ownershipAfter=db.sqlite.prepare("SELECT * FROM notification_subscription_ownership WHERE id='retained-owner'").get();
  for(const [key,value] of Object.entries(ownershipBefore))assert.equal(ownershipAfter[key],value);
  assert.equal(ownershipAfter.entity_id,baseline===7?entityId:null);
  assert.equal(ownershipAfter.reminders_enabled,0);
  assert.ok(db.sqlite.prepare("SELECT name FROM sqlite_schema WHERE name='notification_recipient_deliveries'").get());db.sqlite.close();
});
test('new trusted ownership claims retain the internal participant locator without returning it',async()=>{
  const db=database();const result=await issueNotificationOwnershipClaim(db,{entityType:'booking_request',entityId,journeyType:'booking'});
  assert.equal(db.sqlite.prepare('SELECT entity_id FROM notification_ownership_claims').get().entity_id,entityId);
  assert.equal('entityId' in result,false);assert.equal('entity_id' in result,false);db.sqlite.close();
});
for(const locator of [null,entityId])test(`actual claim handler preserves ${locator?'participant':'legacy null'} locator, replay and device isolation`,async()=>{
  const db=database();try{
    const settings=await device(db),token='c'.repeat(64),tokenHash=await sha256Hex(token),now=new Date().toISOString();
    db.sqlite.prepare("INSERT INTO notification_ownership_claims(id,token_hash,entity_type,entity_ref,journey_type,status,expires_at,created_at,entity_id) VALUES('claim',?,'booking_request',?,'booking','pending','2099-01-01T00:00:00Z',?,?)").run(tokenHash,'e'.repeat(64),now,locator);
    const response=await onRequest({request:request('ownership/claim',{claimToken:token}),env:settings});
    assert.equal(response.status,201);const body=await response.json();assert.equal(body.ok,true);
    assert.equal('entity_id' in body.item,false);assert.equal('entityId' in body.item,false);
    const row=db.sqlite.prepare('SELECT * FROM notification_subscription_ownership').get();assert.equal(row.entity_id,locator);
    assert.equal((await onRequest({request:request('ownership/claim',{claimToken:token}),env:settings})).status,200);
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_subscription_ownership').get().n,1);
    const second=request('device',{},'b'.repeat(64),'device-00000000000002');Object.defineProperty(second,'cf',{value:{colo:'TEST'}});
    assert.equal((await onRequest({request:second,env:settings})).status,201);
    assert.equal((await onRequest({request:request('ownership/claim',{claimToken:token},'b'.repeat(64),'device-00000000000002'),env:settings})).status,409);
    assert.equal((await onRequest({request:request('ownership/claim',{claimToken:token},'b'.repeat(64)),env:settings})).status,404);
  }finally{db.sqlite.close();}
});
test('recovered ownership trigger still rejects an altered participant locator',()=>{
  const db=database(),now=new Date().toISOString();try{
    db.sqlite.prepare("INSERT INTO notification_subscriptions(id,audience,app_variant,device_id,device_token_hash,endpoint,created_at,updated_at,last_seen_at) VALUES('s','public','public','device','hash','inapp://s',?,?,?)").run(now,now,now);
    db.sqlite.prepare("INSERT INTO notification_ownership_claims(id,token_hash,entity_type,entity_ref,journey_type,status,claimed_subscription_id,expires_at,created_at,entity_id) VALUES('c',?,'booking_request',?,'booking','claimed','s','2099-01-01T00:00:00Z',?,?)").run('c'.repeat(64),'e'.repeat(64),now,entityId);
    assert.throws(()=>db.sqlite.prepare("INSERT INTO notification_subscription_ownership(id,claim_id,subscription_id,entity_type,entity_ref,journey_type,verified_at,created_at,entity_id) VALUES('o','c','s','booking_request',?,'booking',?,?,?)").run('e'.repeat(64),now,now,'20000000-0000-4000-8000-000000000002'),/ownership_claim_scope_mismatch/);
  }finally{db.sqlite.close();}
});
function termsJob(db,reminders=1){
  const now='2020-01-01T00:00:00.000Z';
  db.sqlite.prepare("INSERT INTO notification_ownership_claims(id,token_hash,entity_type,entity_ref,journey_type,status,claimed_subscription_id,expires_at,created_at,entity_id) SELECT 'c',?,'booking_request',?,'booking','claimed',id,'2099-01-01T00:00:00Z',?,? FROM notification_subscriptions LIMIT 1").run('c'.repeat(64),'e'.repeat(64),now,entityId);
  db.sqlite.prepare("INSERT INTO notification_subscription_ownership(id,claim_id,subscription_id,entity_type,entity_ref,journey_type,verified_at,created_at,entity_id,reminders_enabled) SELECT 'o','c',id,'booking_request',?,'booking',?,?,?,? FROM notification_subscriptions LIMIT 1").run('e'.repeat(64),now,now,entityId,reminders);
  db.sqlite.prepare("INSERT INTO notification_jobs(id,rule_key,source_type,source_id,source_revision,recipient_subscription_id,audience,category,title_it,body_it,title_en,body_en,scheduled_for,dedupe_key,created_at,ownership_id) SELECT 'terms','customer_participant_terms_reminder','owned_journey',?,'legacy-terms-revision',id,'public','customer_participant_terms_reminder','Synthetic','Synthetic','Synthetic','Synthetic',?,'terms',?,'o' FROM notification_subscriptions LIMIT 1").run('e'.repeat(64),now,now);
}
for(const reminders of [0,1])test(`unsupported participant Terms jobs remain unchanged and unsent with reminder consent ${reminders}`,async()=>{
  const db=database();try{
    const settings=await device(db);termsJob(db,reminders);
    const before=JSON.stringify(db.sqlite.prepare("SELECT * FROM notification_jobs WHERE id='terms'").get());
    const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected provider request');};
    try{await processAutomationJobs(db,settings);}finally{globalThis.fetch=previous;}
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM notification_inbox').get().n,0);
    assert.equal(calls,0);assert.equal(JSON.stringify(db.sqlite.prepare("SELECT * FROM notification_jobs WHERE id='terms'").get()),before);
  }finally{db.sqlite.close();}
});
test('actual ownership preference handler cancels unsent participant Terms reminders on opt-out',async()=>{
  const db=database();try{
    const settings=await device(db);termsJob(db);
    const req=new Request(request('ownership/o/preferences',{remindersEnabled:false}),{method:'PATCH'});
    assert.equal((await onRequest({request:req,env:settings})).status,200);
    assert.equal(db.sqlite.prepare("SELECT status FROM notification_jobs WHERE id='terms'").get().status,'cancelled');
    assert.equal(db.sqlite.prepare("SELECT terminal_reason FROM notification_jobs WHERE id='terms'").get().terminal_reason,'consent_disabled');
  }finally{db.sqlite.close();}
});
let failed=0;for(const [name,run] of tests){try{await run();console.log('PASS',name);}catch(error){failed++;console.error('FAIL',name,error.message);}}
console.log(`Migration compatibility: ${tests.length-failed} passed, ${failed} failed`);if(failed)process.exitCode=1;

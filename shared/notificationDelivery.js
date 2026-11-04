import { resolveSupabaseBackendCredential,supabaseBackendHeaders } from '../functions/api/_shared/supabaseBackend.js';
import { notificationFetch } from './notificationRuntime.js';
import { sendWebPush } from './webPush.js';
import { reservePush, ownedPreferenceColumn, validPushEndpoint } from './notificationPolicy.js';

const now = () => new Date().toISOString();
export function invocationBudget() { return { recipients: 0, pushes: 0, maxRecipients: 20, maxPushes: 5 }; }
export function quietHours(pref, date = new Date()) {
  if(!pref.quiet_hours_enabled||!pref.quiet_start||!pref.quiet_end)return false;
  try {
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:pref.timezone||'Europe/Rome',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
    const minutes=Number(parts.find(p=>p.type==='hour').value)*60+Number(parts.find(p=>p.type==='minute').value);
    const parse=v=>Number(v.slice(0,2))*60+Number(v.slice(3)); const start=parse(pref.quiet_start),end=parse(pref.quiet_end);
    return start<end?minutes>=start&&minutes<end:start>end&&(minutes>=start||minutes<end);
  } catch { return true; }
}

async function currentRecipient(db,event,id,env) {
  if(event.job_id && !(await db.prepare("SELECT id FROM notification_jobs WHERE id=? AND lease_token=? AND status='processing' AND lease_expires_at>?").bind(event.job_id,event.job_lease_token,now()).first()))throw new Error('job_lease_expired');
  if(event.campaign_id && !(await db.prepare("SELECT id FROM notification_campaigns WHERE id=? AND lease_token=? AND status='processing' AND lease_expires_at>?").bind(event.campaign_id,event.campaign_lease_token,now()).first()))throw new Error('campaign_lease_expired');
  const sub=await db.prepare('SELECT s.*,p.* FROM notification_subscriptions s JOIN notification_preferences p ON p.subscription_id=s.id WHERE s.id=? AND s.audience=? AND s.enabled=1').bind(id,event.audience).first();
  if(!sub)return null;
  if(event.audience==='admin'){
    const credential=resolveSupabaseBackendCredential(env);if(!credential||!env.SUPABASE_URL)throw new Error('admin_state_unavailable');
    const response=await notificationFetch(env,`${env.SUPABASE_URL}/rest/v1/admin_profiles?${new URLSearchParams({select:'active',user_id:'eq.'+sub.admin_user_id,limit:'1'})}`,{headers:supabaseBackendHeaders(credential)});
    if(!response.ok)throw new Error('admin_state_unavailable');const rows=await response.json();
    if(!rows[0]?.active){await db.prepare('UPDATE notification_subscriptions SET enabled=0,p256dh=NULL,auth=NULL WHERE id=?').bind(id).run();return null;}
  }
  if(event.rule_key && !(await db.prepare('SELECT enabled FROM notification_automation_rules WHERE rule_key=?').bind(event.rule_key).first())?.enabled)return null;
  if(event.category.startsWith('customer_')) {
    if(!event.ownership_id||!event.recipient_subscription_id)return null;
    const ownership=await db.prepare('SELECT * FROM notification_subscription_ownership WHERE id=? AND subscription_id=? AND revoked_at IS NULL').bind(event.ownership_id,id).first();
    if(!ownership||!ownership[ownedPreferenceColumn(event.category)])return null;
    return {...sub,push_enabled:ownership.push_enabled,inapp_enabled:ownership.inapp_enabled};
  }
  let categories=[];try{categories=JSON.parse(sub.categories_json);}catch{ return null; }
  if(!categories.includes(event.category))return null;
  if(event.language_target&&event.language_target!=='all'&&event.language_target!==sub.resolved_locale)return null;
  return sub;
}

export async function deliverEvent(db,env,input) {
  const budget=env.NOTIFICATION_INVOCATION_BUDGET || (env.NOTIFICATION_INVOCATION_BUDGET=invocationBudget());
  if(input.category.startsWith('customer_')&&!input.recipient_subscription_id)throw new Error('personalized_recipient_required');
  await db.prepare('UPDATE notification_events SET recipient_subscription_id=coalesce(recipient_subscription_id,?),ownership_id=coalesce(ownership_id,?),rule_key=coalesce(rule_key,?),language_target=? WHERE id=?')
    .bind(input.recipient_subscription_id||null,input.ownership_id||null,input.rule_key||null,input.language_target||'all',input.id).run();
  const event=await db.prepare('SELECT * FROM notification_events WHERE id=?').bind(input.id).first();
  if(!event)throw new Error('notification_event_missing');
  event.job_id=input.job_id;event.job_lease_token=input.job_lease_token;
  event.campaign_id=input.campaign_id;event.campaign_lease_token=input.campaign_lease_token;
  // Only pre-send work may be reclaimed. An expired in-flight provider request
  // is terminal unknown; never replay it automatically.
  await db.prepare("UPDATE notification_recipient_deliveries SET state=CASE WHEN state='sending' THEN 'unknown' ELSE 'pending' END,reason=CASE WHEN state='sending' THEN 'lease_expired_during_send' ELSE NULL END,lease_token=NULL WHERE event_id=? AND state IN ('leased','sending') AND lease_expires_at<=?").bind(event.id,now()).run();
  if(!event.fanout_complete && budget.recipients<budget.maxRecipients) {
    const rows=await db.prepare(`SELECT id FROM notification_subscriptions WHERE audience=? AND enabled=1 AND id>? AND created_at<=? ${event.recipient_subscription_id?'AND id=?':''} ORDER BY id LIMIT 20`)
      .bind(...[event.audience,event.recipient_cursor,event.created_at,...(event.recipient_subscription_id?[event.recipient_subscription_id]:[])]).all();
    for(const sub of rows.results||[]) {
      await db.batch([
        db.prepare('INSERT OR IGNORE INTO notification_recipient_deliveries(event_id,subscription_id,updated_at) VALUES(?,?,?)').bind(event.id,sub.id,now()),
        db.prepare('UPDATE notification_events SET recipient_cursor=max(recipient_cursor,?) WHERE id=?').bind(sub.id,event.id)
      ]);
    }
    if((rows.results||[]).length<20)await db.prepare('UPDATE notification_events SET fanout_complete=1 WHERE id=?').bind(event.id).run();
  }
  let attempted=0,accepted=0,failed=0,suppressed=0;
  const due=await db.prepare("SELECT * FROM notification_recipient_deliveries WHERE event_id=? AND state IN ('pending','retry') AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY subscription_id LIMIT 20").bind(event.id,now()).all();
  for(const item of due.results||[]) {
    if(budget.recipients>=budget.maxRecipients||budget.pushes>=budget.maxPushes)break;
    budget.recipients++;
    const token=crypto.randomUUID(),claimedAt=now(),expiry=new Date(Date.parse(claimedAt)+30000).toISOString();
    // The due-row snapshot is only a hint. Another runner may have completed a
    // retryable attempt and installed new backoff before this atomic claim.
    const claimed=await db.prepare("UPDATE notification_recipient_deliveries SET state='leased',lease_token=?,lease_expires_at=?,updated_at=? WHERE event_id=? AND subscription_id=? AND state IN ('pending','retry') AND (next_attempt_at IS NULL OR next_attempt_at<=?) RETURNING subscription_id")
      .bind(token,expiry,claimedAt,event.id,item.subscription_id,claimedAt).first();
    if(!claimed)continue;
    const finish=async(state,reason=null,next=null)=>db.prepare('UPDATE notification_recipient_deliveries SET state=?,reason=?,next_attempt_at=?,updated_at=? WHERE event_id=? AND subscription_id=? AND lease_token=? AND lease_expires_at>?').bind(state,reason,next,now(),event.id,item.subscription_id,token,now()).run();
    let sub=await currentRecipient(db,event,item.subscription_id,env);
    if(!sub){await finish('suppressed','current_consent_or_recipient_unavailable');suppressed++;continue;}
    const title=sub.resolved_locale==='en'?event.title_en:event.title_it,body=sub.resolved_locale==='en'?event.body_en:event.body_it;
    // Inbox insertion is gated by the live credential/consent check and the lease
    // in the INSERT itself, so a resumed expired runner cannot write it.
    if(sub.inapp_enabled!==0)await db.prepare(`INSERT OR IGNORE INTO notification_inbox(id,event_id,subscription_id,audience,category,title,body,destination_url,created_at)
      SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM notification_recipient_deliveries WHERE event_id=? AND subscription_id=? AND lease_token=? AND state='leased' AND lease_expires_at>?)`)
      .bind(crypto.randomUUID(),event.id,sub.id,event.audience,event.category,title,body,event.destination_url,now(),event.id,sub.id,token,now()).run();
    sub=await currentRecipient(db,event,item.subscription_id,env);
    if(!sub){await finish('suppressed','consent_revoked');continue;}
    if(sub.push_enabled===0||!validPushEndpoint(sub.endpoint)||(quietHours(sub)&&event.priority!=='critical')){await finish('inapp_only','push_disabled_or_quiet');continue;}
    if(!await reservePush(db,env,event)){await finish('pending','daily_budget');break;}
    const jobFence=event.job_id?" AND EXISTS(SELECT 1 FROM notification_jobs WHERE id=? AND lease_token=? AND status='processing' AND lease_expires_at>?)":'';
    const campaignFence=event.campaign_id?" AND EXISTS(SELECT 1 FROM notification_campaigns WHERE id=? AND lease_token=? AND status='processing' AND lease_expires_at>?)":'';
    const sendClaim=await db.prepare("UPDATE notification_recipient_deliveries SET state='sending',attempt_count=attempt_count+1 WHERE event_id=? AND subscription_id=? AND lease_token=? AND state='leased' AND lease_expires_at>?"+jobFence+campaignFence+" RETURNING attempt_count").bind(event.id,sub.id,token,now(),...(event.job_id?[event.job_id,event.job_lease_token,now()]:[]),...(event.campaign_id?[event.campaign_id,event.campaign_lease_token,now()]:[])).first();
    if(!sendClaim)continue;
    budget.pushes++;attempted++;
    const push=await sendWebPush(sub,env,{urgency:event.priority==='critical'?'high':'normal',notification:event.audience==='public'?{category:event.category,title,body,url:event.destination_url}:undefined});
    if(push.accepted){accepted++;await finish('accepted','push_service_accepted');}
    else if(push.unknown){failed++;await finish('unknown','provider_outcome_unknown');}
    else if(push.retryable&&sendClaim.attempt_count<3){await finish('retry','provider_retry',new Date(Date.now()+Math.max(push.retryAfterSeconds||0,60*2**(sendClaim.attempt_count-1))*1000).toISOString());}
    else {failed++;await finish('failed',push.dead?'dead_subscription':'provider_rejected');}
    if(push.dead)await db.prepare('UPDATE notification_subscriptions SET endpoint=?,p256dh=NULL,auth=NULL,updated_at=? WHERE id=? AND endpoint=?').bind(`inapp://${event.audience}/${sub.id}`,now(),sub.id,sub.endpoint).run();
  }
  const state=await db.prepare('SELECT fanout_complete FROM notification_events WHERE id=?').bind(event.id).first();
  const counts=await db.prepare('SELECT state,count(*) AS count FROM notification_recipient_deliveries WHERE event_id=? GROUP BY state').bind(event.id).all();
  const totals=Object.fromEntries((counts.results||[]).map(row=>[row.state,row.count]));
  const complete=Boolean(state.fanout_complete)&&!['pending','retry','leased','sending'].some(key=>totals[key]>0);
  if(complete)await db.prepare('UPDATE notification_events SET status=?,sent_at=? WHERE id=?').bind(totals.failed||totals.unknown?'completed_with_errors':'sent',now(),event.id).run();
  return {complete,attempted,accepted,sent:accepted,failed,suppressed,counts:totals,deliveryConfirmed:false};
}

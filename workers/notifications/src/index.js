import { notificationFetch,notificationDatabase,runtimeBudget } from '../../../shared/notificationRuntime.js';
import { reconcileOutbox } from '../../../shared/notificationOutbox.js';
import { deliverEvent, invocationBudget } from '../../../shared/notificationDelivery.js';
import { authoritativeCustomerEvent, upcomingReminderState, processPersonalizedEvent } from '../../../functions/api/notifications/[[path]].js';
import { validPushEndpoint, ownedPreferenceColumn } from '../../../shared/notificationPolicy.js';
import { sendWebPush } from '../../../shared/webPush.js';
import { resolveSupabaseBackendCredential, supabaseBackendHeaders } from '../../../functions/api/_shared/supabaseBackend.js';

const INGV_SOURCE = 'https://www.ct.ingv.it/sezioniesterne/Comunicati/ComunicatiVulcanici.php';
const PUBLIC_CATEGORIES = new Set(['etna_updates','etna_weekly','experiences','events','news','promotions']);
const CUSTOMER_CATEGORIES = new Set(['customer_booking_confirmed','customer_payment_received','customer_upcoming_reminder','customer_operational_change','customer_booking_rescheduled','customer_booking_cancelled','customer_review_reminder']);
const CRITICAL_ADMIN = new Set(['security_alerts']);
function nowIso(){return new Date().toISOString();}
function uuid(){return crypto.randomUUID();}
function text(value,max=500){return String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').slice(0,max);}
async function digest(value){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return [...new Uint8Array(d)].map((b)=>b.toString(16).padStart(2,'0')).join('');}
function parseJson(value,fallback=[]){try{return JSON.parse(value);}catch{return fallback;}}
const endpointValid=validPushEndpoint;
function stripHtml(value){return text(String(value||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'"),1000);}
function absoluteUrl(href){try{return new URL(href,INGV_SOURCE).toString();}catch{return INGV_SOURCE;}}
function classifyEtna(description){const d=description.toUpperCase();if(/PRIMO COMUNICATO|INIZIO/.test(d))return'event_started';if(/FINE FENOMENO|FINE DELL|RIENTRO/.test(d))return'event_ended';if(/BOLLETTINO.*SETTIMAN|SETTIMANALE/.test(d))return'weekly_bulletin';return'activity_update';}
function parseEtnaRows(html){
  const rows=[]; const rowPattern=/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi; let match;
  while((match=rowPattern.exec(html))){const raw=match[1];const plain=stripHtml(raw);if(!/\bETNA\b/i.test(plain))continue;const href=raw.match(/href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/i)?.[1]||raw.match(/href=["']([^"']+)["']/i)?.[1]||'';const date=plain.match(/\b(\d{4}[-\/]\d{2}[-\/]\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?|\d{2}[-\/]\d{2}[-\/]\d{4}(?:\s+\d{2}:\d{2})?)\b/)?.[1]||'';rows.push({description:plain,date,sourceUrl:absoluteUrl(href)});}
  return rows.slice(0,30);
}
function localMinutes(date,timezone){try{const p=new Intl.DateTimeFormat('en-GB',{timeZone:timezone||'Europe/Rome',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);return Number(p.find((x)=>x.type==='hour')?.value||0)*60+Number(p.find((x)=>x.type==='minute')?.value||0);}catch{return null;}}
function quiet(pref,date=new Date()){if(!pref.quiet_hours_enabled||!pref.quiet_start||!pref.quiet_end)return false;const to=(v)=>Number(v.slice(0,2))*60+Number(v.slice(3));const n=localMinutes(date,pref.timezone);if(n===null)return false;const s=to(pref.quiet_start),e=to(pref.quiet_end);return s===e?false:s<e?n>=s&&n<e:n>=s||n<e;}
async function increment(db,key,amount=1){const day=nowIso().slice(0,10);await db.prepare('INSERT INTO notification_usage_counters(counter_date,counter_key,counter_value,updated_at) VALUES(?,?,?,?) ON CONFLICT(counter_date,counter_key) DO UPDATE SET counter_value=counter_value+excluded.counter_value,updated_at=excluded.updated_at').bind(day,key,amount,nowIso()).run();}
async function budget(db,env){const day=nowIso().slice(0,10);const row=await db.prepare("SELECT counter_value FROM notification_usage_counters WHERE counter_date=? AND counter_key='push_attempts'").bind(day).first();const attempts=Number(row?.counter_value||0),cap=Math.max(1,Number(env.NOTIFICATION_PUBLIC_DAILY_SEND_CAP||1000)),pct=attempts/cap*100;const w=Number(env.NOTIFICATION_WARNING_PERCENT||70),c=Number(env.NOTIFICATION_CONSERVATION_PERCENT||85),h=Number(env.NOTIFICATION_HARD_STOP_PERCENT||95);return{attempts,cap,percent:Number(pct.toFixed(1)),mode:pct>=h?'HARD_SAFETY':pct>=c?'CONSERVATION':pct>=w?'WARNING':'NORMAL'};}
function budgetAllows(mode,event){if(mode==='NORMAL'||mode==='WARNING')return true;if(mode==='CONSERVATION')return !['promotions','daily_summary','weekly_summary','etna_weekly'].includes(event.category);if(mode==='HARD_SAFETY')return event.audience==='admin'&&event.priority==='critical';return true;}
async function audit(db,type,fields={}){await db.prepare('INSERT INTO notification_audit_log(id,event_type,audience,actor_id,subscription_id,campaign_id,outcome,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(uuid(),type,fields.audience||null,fields.actorId||null,fields.subscriptionId||null,fields.campaignId||null,fields.outcome||'ok',fields.metadata?JSON.stringify(fields.metadata):null,nowIso()).run();}
const deliver = deliverEvent;
async function queueAndDeliver(db,env,input){
  let event=await db.prepare('SELECT * FROM notification_events WHERE dedupe_key=?').bind(input.dedupe_key).first();
  if(!event){const id=input.id||uuid();await db.prepare('INSERT OR IGNORE INTO notification_events(id,audience,category,origin,title_it,body_it,title_en,body_en,destination_url,dedupe_key,priority,created_at,status,recipient_subscription_id,ownership_id,rule_key,language_target) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id,input.audience,input.category,input.origin,input.title_it,input.body_it,input.title_en,input.body_en,input.destination_url||'/',input.dedupe_key,input.priority||'normal',nowIso(),'sending',input.recipient_subscription_id||null,input.ownership_id||null,input.rule_key||null,input.language_target||'all').run();
    event=await db.prepare('SELECT * FROM notification_events WHERE dedupe_key=?').bind(input.dedupe_key).first();}
  if(['sent','completed_with_errors'].includes(event.status))return{complete:true,deduped:true,counts:{failed:event.status==='completed_with_errors'?1:0}};
  return deliver(db,env,{...event,rule_key:event.rule_key||input.rule_key,job_id:input.job_id,job_lease_token:input.job_lease_token,campaign_id:input.campaign_id,campaign_lease_token:input.campaign_lease_token});
}
async function pollEtna(db,env){
  const response=await notificationFetch(env,INGV_SOURCE,{headers:{'User-Agent':'vulcanIQ official-source monitor/1.0'}});if(!response.ok)throw new Error(`ingv_http_${response.status}`);const html=await response.text();const rows=parseEtnaRows(html);if(!rows.length)throw new Error('ingv_no_etna_rows');const existingCount=Number((await db.prepare("SELECT count(*) AS total FROM notification_source_dedupe WHERE source='INGV_OE_ETNA'").first())?.total||0);let newCount=0;
  for(const row of [...rows].reverse()){const sourceIdentifier=await digest(`${row.date}|${row.description}|${row.sourceUrl}`);const dedupe=`ingv:${sourceIdentifier}`;const exists=await db.prepare('SELECT dedupe_key FROM notification_source_dedupe WHERE dedupe_key=?').bind(dedupe).first();if(exists)continue;newCount++;const classification=classifyEtna(row.description);await db.prepare('INSERT INTO notification_source_dedupe(dedupe_key,source,source_url,source_identifier,official_timestamp,retrieved_at,classification,content_hash) VALUES(?,?,?,?,?,?,?,?)').bind(dedupe,'INGV_OE_ETNA',row.sourceUrl,sourceIdentifier,row.date||null,nowIso(),classification,await digest(row.description)).run();if(existingCount===0)continue;
    const category=classification==='weekly_bulletin'?'etna_weekly':'etna_updates';if(classification==='activity_update'){const hours=Math.max(1,Number(env.ETNA_ROUTINE_MIN_INTERVAL_HOURS||6));const recent=await db.prepare("SELECT created_at FROM notification_events WHERE origin='ingv_etna' AND category='etna_updates' AND created_at>=? ORDER BY created_at DESC LIMIT 1").bind(new Date(Date.now()-hours*3600000).toISOString()).first();if(recent)continue;}
    await queueAndDeliver(db,env,{audience:'public',category,origin:'ingv_etna',title_it:'Aggiornamento Etna',body_it:"INGV ha pubblicato un nuovo aggiornamento sull'attività dell'Etna. Tocca per i dettagli ufficiali.",title_en:'Etna update',body_en:'INGV has published a new update on Mount Etna activity. Tap for the official details.',destination_url:`/install?notificationSource=${sourceIdentifier}`,dedupe_key:`event:${dedupe}`,priority:['event_started','event_ended'].includes(classification)?'high':'normal'});
  }
  await increment(db,'etna_source_checks');return{rows:rows.length,newCount,baseline:existingCount===0};
}
async function processCampaigns(db,env){
  const current=nowIso();
  const due=await db.prepare("SELECT * FROM notification_campaigns WHERE status='queued' OR (status='scheduled' AND scheduled_for<=?) OR (status='processing' AND lease_expires_at<=?) ORDER BY created_at LIMIT 5").bind(current,current).all();
  for(const campaign of due.results||[]){
    const token=uuid(),expires=new Date(Date.now()+30000).toISOString();
    const claim=await db.prepare("UPDATE notification_campaigns SET status='processing',processing_at=?,lease_token=?,lease_expires_at=? WHERE id=? AND (status IN ('scheduled','queued') OR (status='processing' AND lease_expires_at<=?)) RETURNING id").bind(current,token,expires,campaign.id,current).first();if(!claim)continue;
    try {
      const result=await queueAndDeliver(db,env,{...campaign,id:undefined,campaign_id:campaign.id,campaign_lease_token:token,audience:'public',origin:'admin_campaign',title_it:campaign.title_it||campaign.title_en,body_it:campaign.body_it||campaign.body_en,title_en:campaign.title_en||campaign.title_it,body_en:campaign.body_en||campaign.body_it,priority:'normal'});
      const finalStatus=result.complete?(result.counts?.failed||result.counts?.unknown?'failed':'sent'):'queued';
      await db.prepare('UPDATE notification_campaigns SET status=?,sent_at=?,updated_at=? WHERE id=? AND lease_token=? AND lease_expires_at>?').bind(finalStatus,finalStatus==='sent'?nowIso():null,nowIso(),campaign.id,token,nowIso()).run();
    }catch{await db.prepare("UPDATE notification_campaigns SET status='queued',failure_reason='delivery_interrupted' WHERE id=? AND lease_token=? AND lease_expires_at>?").bind(campaign.id,token,nowIso()).run();}
  }
}
async function processAutomationJobs(db,env){
  const current=nowIso();let processed=0;
  await db.prepare("UPDATE notification_jobs SET status=CASE WHEN push_started_at IS NULL THEN 'scheduled' ELSE 'failed' END,terminal_reason=CASE WHEN push_started_at IS NULL THEN NULL ELSE 'push_outcome_unknown' END,lease_token=NULL WHERE status='processing' AND coalesce(lease_expires_at,processing_at)<=?").bind(current).run();
  // Preserve jobs from feature branches whose canonical dispatch contract is not
  // installed in this runtime. They must not enter generic delivery or starve
  // supported work; a compatible handler can resume them without a queue rewrite.
  const supportedCustomerCategories=[...CUSTOMER_CATEGORIES];
  const customerPlaceholders=supportedCustomerCategories.map(()=>'?').join(',');
  const due=await db.prepare(`SELECT * FROM notification_jobs WHERE status='scheduled' AND scheduled_for<=? AND (next_attempt_at IS NULL OR next_attempt_at<=?) AND (substr(category,1,9)<>'customer_' OR category IN (${customerPlaceholders})) ORDER BY coalesce(next_attempt_at,scheduled_for),id LIMIT 5`).bind(current,current,...supportedCustomerCategories).all();
  for(const job of due.results||[]){
    const token=uuid(),claimedAt=nowIso(),expires=new Date(Date.now()+30000).toISOString();
    const claim=await db.prepare("UPDATE notification_jobs SET status='processing',processing_at=?,lease_token=?,lease_expires_at=? WHERE id=? AND status='scheduled' AND scheduled_for<=? AND (next_attempt_at IS NULL OR next_attempt_at<=?) RETURNING id,attempt_count,max_attempts").bind(claimedAt,token,expires,job.id,claimedAt,claimedAt).first();if(!claim)continue;
    const finish=(status,reason=null)=>db.prepare('UPDATE notification_jobs SET status=?,failure_reason=?,terminal_reason=?,sent_at=? WHERE id=? AND lease_token=? AND lease_expires_at>?').bind(status,reason,status==='cancelled'?reason:null,status==='sent'?nowIso():null,job.id,token,nowIso()).run();
    let validatingCanonical=false;
    try{
      const rule=job.rule_key?await db.prepare('SELECT enabled,offset_minutes FROM notification_automation_rules WHERE rule_key=?').bind(job.rule_key).first():null;
      if(job.rule_key&&!rule?.enabled){await finish('cancelled','rule_disabled');continue;}
      if(CUSTOMER_CATEGORIES.has(job.category)){
        const ownership=await db.prepare('SELECT * FROM notification_subscription_ownership WHERE id=? AND subscription_id=? AND revoked_at IS NULL').bind(job.ownership_id,job.recipient_subscription_id).first();
        if(!ownership||!ownership[ownedPreferenceColumn(job.category)]){await finish('cancelled','owned_recipient_unavailable');continue;}
        // Historical jobs without canonical context are held, never guessed safe.
        if(!job.canonical_entity_id||!job.canonical_event_type){await finish('cancelled','canonical_context_missing');continue;}
        validatingCanonical=true;
        const config={url:String(env.SUPABASE_URL||'').replace(/\/$/,''),backendCredential:resolveSupabaseBackendCredential(env),env};
        if(!config.url||!config.backendCredential)throw new Error('canonical_unavailable');
        const state=await authoritativeCustomerEvent(config,job.canonical_entity_id,job.canonical_event_type);
        let superseded=state.error||state.sourceRevision!==job.source_revision;
        if(job.category==='customer_upcoming_reminder'){
          const reminder=await upcomingReminderState(state,rule?.offset_minutes);
          // Legacy jobs retain their originating event revision. They still need
          // independent current eligibility AND the exact canonical schedule.
          const revision=job.canonical_event_type==='upcoming_reminder'?reminder.sourceRevision:state.sourceRevision;
          superseded=reminder.error||revision!==job.source_revision||reminder.scheduledFor!==job.scheduled_for;
        }
        validatingCanonical=false;
        if(superseded){await finish('cancelled','business_state_superseded');continue;}
      }
      const result=await queueAndDeliver(db,env,{...job,id:undefined,origin:'automation_job',dedupe_key:job.source_type==='trusted_ingest'?job.dedupe_key.slice(4):`automation:${job.dedupe_key}`,job_id:job.id,job_lease_token:token});
      await finish(result.complete?(result.counts?.unknown||result.counts?.failed?'failed':'sent'):'scheduled',result.counts?.unknown?'push_outcome_unknown':result.counts?.failed?'provider_rejected':null); if(result.complete)processed++;
    }catch{
      if(validatingCanonical){
        const attempt=Number(claim.attempt_count||0)+1,exhausted=attempt>=Number(claim.max_attempts||3);
        const next=exhausted?null:new Date(Date.now()+60000*2**(attempt-1)).toISOString();
        await db.prepare('UPDATE notification_jobs SET status=?,attempt_count=attempt_count+1,last_attempt_at=?,next_attempt_at=?,failure_reason=?,terminal_reason=?,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND lease_token=? AND lease_expires_at>?')
          .bind(exhausted?'failed':'scheduled',nowIso(),next,'canonical_state_unavailable',exhausted?'canonical_validation_exhausted':null,job.id,token,nowIso()).run();
      }else await finish('scheduled','delivery_interrupted');
    }
  }
  return{due:(due.results||[]).length,processed};
}
export async function continueEvents(db,env){
  const pending=await db.prepare("SELECT * FROM notification_events WHERE status IN ('sending','queued') AND category NOT LIKE 'customer_%' AND origin NOT IN ('admin_campaign','trusted_ingest','automation_job','owned_journey') ORDER BY created_at LIMIT 5").all();
  for(const event of pending.results||[])await deliver(db,env,event);
}
async function pollPublicExcursions(db,env){
  const url=text(env.SUPABASE_URL||env.VITE_SUPABASE_URL,300).replace(/\/$/,'');const anon=env.SUPABASE_ANON_KEY||env.VITE_SUPABASE_ANON_KEY;if(!url||!anon)return{skipped:true};const today=new Date();const from=today.toISOString().slice(0,10),to=new Date(today.getTime()+48*3600000).toISOString().slice(0,10);const params=new URLSearchParams({select:'id,date,start_time,title_it,title_en,active,public_visibility',active:'eq.true',public_visibility:'eq.true',order:'date.asc,start_time.asc',limit:'100'});params.append('date',`gte.${from}`);params.append('date',`lte.${to}`);const response=await notificationFetch(env,`${url}/rest/v1/public_fixed_excursions?${params}`,{headers:{apikey:anon,Authorization:`Bearer ${anon}`,Accept:'application/json'}});if(!response.ok)return{skipped:true,status:response.status};const rows=await response.json();for(const item of Array.isArray(rows)?rows:[]){if(item.date>to)continue;const key=`fixed_excursion_48h:${item.id}:${item.date}`;await queueAndDeliver(db,env,{audience:'public',category:'experiences',origin:'vulcaniq_domain',title_it:'Esperienza vulcanIQ in arrivo',body_it:`${text(item.title_it||'Escursione sull’Etna',100)} · ${item.date}${item.start_time?` · ${item.start_time.slice(0,5)}`:''}`,title_en:'Upcoming vulcanIQ experience',body_en:`${text(item.title_en||item.title_it||'Mount Etna experience',100)} · ${item.date}${item.start_time?` · ${item.start_time.slice(0,5)}`:''}`,destination_url:'/experiences',dedupe_key:key,priority:'normal'});}return{rows:Array.isArray(rows)?rows.length:0};
}
async function pollAdminUpcoming(db,env){
  const url=text(env.SUPABASE_URL||env.VITE_SUPABASE_URL,300).replace(/\/$/,'');const backendCredential=resolveSupabaseBackendCredential(env);if(!url||!backendCredential)return{skipped:true};const tomorrow=new Date(Date.now()+24*3600000).toISOString().slice(0,10);const params=new URLSearchParams({select:'id,requested_date,status',requested_date:`eq.${tomorrow}`,status:'eq.accepted',limit:'100'});const response=await notificationFetch(env,`${url}/rest/v1/booking_requests?${params}`,{headers:supabaseBackendHeaders(backendCredential,{headers:{Accept:'application/json'}})});if(!response.ok)return{skipped:true,status:response.status};const rows=await response.json();if(Array.isArray(rows)&&rows.length){await queueAndDeliver(db,env,{audience:'admin',category:'upcoming_excursions',origin:'vulcaniq_domain',title_it:'Escursioni di domani',body_it:`${rows.length} prenotazion${rows.length===1?'e':'i'} richiedono attenzione per domani.`,title_en:'Tomorrow’s excursions',body_en:`${rows.length} booking${rows.length===1?'':'s'} need attention for tomorrow.`,destination_url:'/admin/upcoming',dedupe_key:`admin_upcoming:${tomorrow}`,priority:'normal'});}return{rows:Array.isArray(rows)?rows.length:0};
}
async function runScheduled(input){
  const env={...input,NOTIFICATION_INVOCATION_BUDGET:invocationBudget(),NOTIFICATION_RUNTIME_BUDGET:runtimeBudget()},db=notificationDatabase(env.NOTIFICATIONS_DB,env.NOTIFICATION_RUNTIME_BUDGET);
  if(!db)throw new Error('notifications_db_not_configured');
  const results={};
  // One bounded invocation context is shared across every path. Publication is
  // DB-only; sending remains contingent on the later per-recipient checks.
  const tasks=[['outbox',()=>reconcileOutbox(db,env,processPersonalizedEvent)],['continuations',()=>continueEvents(db,env)],['automationJobs',()=>processAutomationJobs(db,env)],['campaigns',()=>processCampaigns(db,env)],['etna',()=>pollEtna(db,env)],['experiences',()=>pollPublicExcursions(db,env)],['adminUpcoming',()=>pollAdminUpcoming(db,env)]];
  const lane=await db.prepare("INSERT INTO notification_usage_counters(counter_date,counter_key,counter_value,updated_at) VALUES(?,'scheduler_lane',1,?) ON CONFLICT(counter_date,counter_key) DO UPDATE SET counter_value=counter_value+1 RETURNING counter_value").bind(nowIso().slice(0,10),nowIso()).first();
  const first=tasks.shift(),offset=Number(lane.counter_value)%tasks.length;tasks.push(...tasks.splice(0,offset));tasks.unshift(first);
  for(const [name,run] of tasks){try{results[name]=await run();}catch{results[name]={error:'notification_processing_failed'};}}
  return results;
}

export { budgetAllows, classifyEtna, endpointValid, parseEtnaRows, processAutomationJobs, processCampaigns, quiet, runScheduled };

export default {
  async fetch(request,env){const url=new URL(request.url);if(url.pathname==='/health'){const b=env.NOTIFICATIONS_DB?await budget(env.NOTIFICATIONS_DB,env):null;return Response.json({ok:Boolean(env.NOTIFICATIONS_DB),budget:b,source:INGV_SOURCE},{headers:{'Cache-Control':'no-store'}});}return new Response('Not found',{status:404});},
  async scheduled(_controller,env,ctx){ctx.waitUntil(runScheduled(env));}
};

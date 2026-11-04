import { notificationFetch } from './notificationRuntime.js';
import { resolveSupabaseBackendCredential,supabaseBackendHeaders } from '../functions/api/_shared/supabaseBackend.js';

export function isolatedOutboxConfig(env) {
  const url=String(env.SUPABASE_URL||'').replace(/\/$/,'');
  const backendCredential=resolveSupabaseBackendCredential(env);
  // Activation is a separately authorized change. Preview must name its own
  // isolated backend; copying Production URL into a preview stanza is unsafe.
  if(env.NOTIFICATION_OUTBOX_ENABLED!=='true')return null;
  if(!url||!backendCredential||url!==env.NOTIFICATION_EXPECTED_SUPABASE_URL)throw new Error('notification_outbox_target_mismatch');
  if(env.NOTIFICATION_ENVIRONMENT==='preview'&&url===env.NOTIFICATION_PRODUCTION_SUPABASE_URL)throw new Error('notification_preview_shared_backend');
  if(!['local','preview','production'].includes(env.NOTIFICATION_ENVIRONMENT))throw new Error('notification_environment_required');
  if(env.NOTIFICATION_ENVIRONMENT==='preview'&&!env.NOTIFICATION_PRODUCTION_SUPABASE_URL)throw new Error('notification_preview_isolation_unverified');
  return{url,backendCredential,env};
}
export async function reconcileOutbox(db,env,publish,{id=null,paymentOnly=false}={}) {
  const config=isolatedOutboxConfig(env);if(!config)return{disabled:true,processed:0,items:[]};
  const rpc=async(name,args)=>{
    const response=await notificationFetch(env,`${config.url}/rest/v1/rpc/${name}`,{method:'POST',headers:supabaseBackendHeaders(config.backendCredential,{headers:{'Content-Type':'application/json'}}),body:JSON.stringify(args),signal:AbortSignal.timeout(8000),redirect:'error'});
    if(!response.ok)throw new Error(`notification_outbox_rpc_${response.status}`);
    return response.json();
  };
  const rows=await rpc('claim_customer_notification_outbox',{p_limit:2,p_id:id,p_payment_only:paymentOnly});
  const items=[];
  for(const row of rows){
    let status='failed',error=null;
    try{
      const result=await publish(db,env,config,'backend-outbox',row.entity_type,row.entity_id,row.event_type);
      status=['cancelled','no_verified_recipient','invalid_business_state'].includes(result.status)||result.error==='personalized_invalid_business_state'?'suppressed':result.ok&&!['failed','processing'].includes(result.status)?'delivered':'failed';
      error=status==='failed'?'notification_publication_incomplete':null;
    }catch{error='notification_publication_failed';}
    const finalized=await rpc('finish_customer_notification_outbox',{p_id:row.id,p_token:row.lease_token,p_status:status,p_error:error});
    items.push({outboxId:row.id,status:finalized?status:'lease_expired',eventType:row.event_type});
  }
  return{processed:items.length,items};
}

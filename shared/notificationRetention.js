// No scheduler calls this helper. Live deletion requires a reviewed retention
// policy and separate explicit configuration; dry-run is the default.
export async function notificationRetention(db,{now=new Date(),dryRun=true,enabled=false,limit=100}={}) {
  const size=Math.max(1,Math.min(100,Number(limit)||100));
  const cutoff=days=>new Date(now.getTime()-days*86400000).toISOString();
  const plans=[
    ['rateLimits','notification_rate_limits','rate_key','window_started_at<?',cutoff(2)],
    ['audit','notification_audit_log','id','created_at<?',cutoff(90)],
    ['inbox','notification_inbox','id','dismissed_at IS NOT NULL AND dismissed_at<?',cutoff(90)],
    ['expiredClaims','notification_ownership_claims','id',"status IN ('expired','revoked') AND expires_at<? AND NOT EXISTS(SELECT 1 FROM notification_subscription_ownership o WHERE o.claim_id=notification_ownership_claims.id)",cutoff(90)]
  ];
  const result={dryRun:dryRun||!enabled,counts:{}};
  for(const [name,table,key,predicate,date] of plans){
    const rows=await db.prepare(`SELECT ${key} AS id FROM ${table} WHERE ${predicate} ORDER BY ${key} LIMIT ?`).bind(date,size).all();
    result.counts[name]=(rows.results||[]).length;
    if(!result.dryRun)for(const row of rows.results||[])await db.prepare(`DELETE FROM ${table} WHERE ${key}=? AND ${predicate}`).bind(row.id,date).run();
  }
  return result;
}

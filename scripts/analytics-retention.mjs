import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Proposal tooling: no live schedule; no operational tables are ever deleted.
export function retentionSql(days, { apply = false, batch = 500 } = {}) {
  if (!Number.isInteger(days) || days < 30 || days > 3650 || !Number.isInteger(batch) || batch < 1 || batch > 1000) throw new Error('invalid_retention_bounds');
  const eligible = `e.occurred_at < now() - interval '${days} days'
    and not exists(select 1 from public.booking_requests b where b.analytics_session_id=e.session_id or b.analytics_visitor_id=e.visitor_id)
    and not exists(select 1 from public.gift_card_requests g where g.analytics_session_id=e.session_id or g.analytics_visitor_id=e.visitor_id)`;
  if (!apply) return `begin read only; select count(*) as eligible_unlinked_events from public.analytics_events e where ${eligible}; rollback;`;
  return `begin; with eligible as (select e.id from public.analytics_events e where ${eligible} order by e.occurred_at,e.id limit ${batch} for update skip locked), removed as (delete from public.analytics_events e using eligible x where e.id=x.id returning 1) select count(*) as removed_events from removed; commit;`;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const value = process.env.RETENTION_LOCAL_DB_URL || '';
  const target = new URL(value);
  if (!['localhost','127.0.0.1','[::1]'].includes(target.hostname) || !target.pathname.startsWith('/vulcaniq_retention_')) throw new Error('retention_requires_named_local_fixture_database');
  const apply = process.argv.includes('--apply-local');
  if (apply && process.env.RETENTION_POLICY_APPROVED !== 'true') throw new Error('retention_policy_approval_required');
  const days = Number(process.env.ANALYTICS_RETENTION_DAYS);
  const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', retentionSql(days, { apply })], { env: { ...process.env, PGDATABASE: value }, encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) throw new Error('retention_query_failed');
  console.log(result.stdout.trim());
}

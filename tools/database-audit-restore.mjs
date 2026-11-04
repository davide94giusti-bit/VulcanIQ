import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Logical restore of synthetic Auth identities + business foreign keys only.
// Deliberately refuses populated source tables and every non-local Docker context.
const container = process.env.AUDIT_LOCAL_CONTAINER || 'supabase_db_VulcanIQ-release-20260821';
const database = process.env.AUDIT_LOCAL_DB || 'vulcaniq_audit_fresh_20261027';
assert.ok((container === 'supabase_db_VulcanIQ-release-20260821' && database === 'vulcaniq_audit_fresh_20261027')
  || (container === 'supabase_db_VulcanIQ-audit-ci' && database === 'postgres'), 'Isolated test database required');
const restored = process.env.AUDIT_RESTORE_DB || 'vulcaniq_audit_restore_20261027';
assert.ok(['vulcaniq_audit_restore_20261027', 'vulcaniq_audit_restore_final_20261027', 'vulcaniq_audit_restore_ci_20261027'].includes(restored), 'Exact isolated restore target required');
function docker(args, input) {
  const r = spawnSync('docker', args, { encoding: 'utf8', input, maxBuffer: 4 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`Local restore command failed: ${r.stderr || r.error || r.status}`);
  return r.stdout.trim();
}
assert.match(docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']), /^(npipe:\/\/|unix:\/\/\/var\/run\/docker.sock$)/);
function sql(statement, target = database) {
  return docker(['exec', '-i', container, 'psql', '-U', 'supabase_admin', '-d', target, '-X', '-At', '-v', 'ON_ERROR_STOP=1'], statement);
}
assert.equal(sql('select (select count(*) from auth.users)+(select count(*) from public.admin_profiles)+(select count(*) from public.booking_requests)+(select count(*) from public.finance_entries);'), '0', 'Fixture source tables must be empty');
assert.equal(sql(`select count(*) from pg_database where datname='${restored}';`), '0', 'Never overwrite an existing restore target');
// Do not use TEMPLATE source: the fresh CI Supabase services may hold source connections.
sql(`create database ${restored};`, 'template1');
const schema = '/tmp/vulcaniq-audit-synthetic-restore-schema.sql';
docker(['exec', container, 'pg_dump', '-U', 'supabase_admin', '-d', database, '--schema-only', '--no-owner', '-f', schema]);
docker(['exec', container, 'psql', '-U', 'supabase_admin', '-d', restored, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', schema]);
const id = 'a7000000-0000-4000-8000-000000000001';
try {
  sql(`begin;
insert into auth.users(id,email) values('${id}','restore-owner@example.invalid');
insert into public.admin_profiles(user_id,role,active,full_name) values('${id}','owner',true,'Synthetic restore owner');
insert into public.booking_requests(id,status,source,customer_name,created_by_admin) values('${id}','accepted','manual','Synthetic restore booking','${id}');
insert into public.finance_entries(id,entry_date,type,amount,currency,title,status,booking_request_id,source_type,source_id,created_by) values('${id}',current_date,'income',40,'EUR','Synthetic restore payment','confirmed','${id}','booking_request','${id}','${id}');
commit;`);
  const dump = '/tmp/vulcaniq-audit-synthetic-identity-restore.sql';
  docker(['exec', container, 'pg_dump', '-U', 'supabase_admin', '-d', database, '--data-only', '--column-inserts', '--no-owner', '-t', 'auth.users', '-t', 'public.admin_profiles', '-t', 'public.booking_requests', '-t', 'public.finance_entries', '-f', dump]);
  docker(['exec', container, 'psql', '-U', 'supabase_admin', '-d', restored, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', dump]);
  assert.equal(sql(`select count(*) from auth.users u join public.admin_profiles p on p.user_id=u.id join public.booking_requests b on b.created_by_admin=u.id join public.finance_entries f on f.booking_request_id=b.id and f.created_by=u.id where u.id='${id}' and p.role='owner' and f.amount=40 and f.currency='EUR';`, restored), '1');
  console.log('PASS Auth UUID, admin profile and booking/finance foreign keys survive logical restore');
  assert.equal(sql(`begin; select set_config('request.jwt.claim.sub','${id}',true); set local role authenticated; select public.is_owner(); rollback;`, restored).split('\n').includes('t'), true);
  console.log('PASS restored Auth UUID resolves the active owner predicate');
  assert.equal(sql(`select count(*) from public.finance_entries where id='${id}' and amount=40 and status='confirmed';`, restored), '1');
  console.log('PASS restored recognized ledger retains amount and status');
  console.log(`3 synthetic identity restore checks passed; isolated restore database retained: ${restored}`);
} finally {
  sql(`begin; delete from public.finance_entries where id='${id}'; delete from public.booking_requests where id='${id}'; delete from public.admin_profiles where user_id='${id}'; delete from auth.users where id='${id}'; delete from public.activity_log where entity_id='${id}' or actor_id='${id}'; commit;`);
}

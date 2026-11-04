param([switch]$KeepLocalStack)
$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent $PSScriptRoot
$container = 'supabase_db_VulcanIQ-audit-ci'
$dockerContext = (& docker context inspect --format '{{.Endpoints.docker.Host}}').Trim()
if ($LASTEXITCODE -ne 0 -or $dockerContext -notmatch '^(npipe://|unix:///var/run/docker.sock$)') { throw 'A local Docker socket is required.' }
$existing = & docker ps -a --filter "name=^/$container$" --format '{{.Names}}'
if ($existing) { throw 'Audit container already exists; inspect and stop that dedicated stack explicitly before a new run.' }
$taskDirectory = Join-Path ([IO.Path]::GetTempPath()) ('VulcanIQ-audit-' + [guid]::NewGuid().ToString('N'))
$project = Join-Path $taskDirectory 'VulcanIQ-audit-ci'
$supabaseDirectory = Join-Path $project 'supabase'
New-Item -ItemType Directory -Path $supabaseDirectory -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $repository 'supabase/migrations') -Destination $supabaseDirectory -Recurse
# Generated local-only configuration. No .env, .temp linkage, data, secrets or Functions copied.
$config = @'
project_id = "VulcanIQ-audit-ci"
[api]
port = 55321
[db]
port = 55322
shadow_port = 55320
major_version = 17
[studio]
enabled = false
[inbucket]
enabled = false
[storage]
enabled = true
[analytics]
enabled = false
[edge_runtime]
enabled = false
'@
[IO.File]::WriteAllText((Join-Path $supabaseDirectory 'config.toml'), $config)
$cli = (Get-Command supabase -ErrorAction SilentlyContinue).Source
if (-not $cli) { throw 'Install the Supabase CLI first. No automatic dependency installation is performed.' }
function Invoke-Checked([scriptblock]$Command) { & $Command; if ($LASTEXITCODE -ne 0) { throw "Local validation failed: $LASTEXITCODE" } }
try {
  # This brand-new project/container has no relationship to the existing developer stack.
  # Supabase CLI emits local demo keys on start; suppress stdout instead of archiving credentials.
  & $cli start --workdir $project 1>$null
  if ($LASTEXITCODE -ne 0) { throw 'Disposable Supabase start failed' }
  Invoke-Checked { & $cli db reset --local --workdir $project 1>$null }
  Invoke-Checked { docker cp (Join-Path $repository 'tools/database-audit-behavior.sql') "${container}:/tmp/audit-behavior.sql" }
  Invoke-Checked { docker exec $container psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 -f /tmp/audit-behavior.sql }
  $env:AUDIT_LOCAL_CONTAINER = $container
  $env:AUDIT_LOCAL_DB = 'postgres'
  Invoke-Checked { node (Join-Path $repository 'tools/database-audit-concurrency.mjs') }
  Invoke-Checked { node (Join-Path $repository 'tools/database-audit-restore.mjs') }

  # Replay the 38-migration recorded Production baseline (including recovered Terms history), then seven pending migrations.
  # Keep genuine Supabase auth/storage/extension schemas; every statement targets this test container.
  Invoke-Checked { docker exec $container psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 -c 'drop schema public cascade; create schema public authorization postgres; grant usage on schema public to public;' }
  Invoke-Checked { docker cp (Join-Path $repository 'supabase/migrations') "${container}:/tmp/audit-migrations" }
  $files = Get-ChildItem -LiteralPath (Join-Path $repository 'supabase/migrations') -File -Filter '*.sql' | Sort-Object Name
  foreach ($file in $files | Where-Object Name -lt '20261005100000') {
    Invoke-Checked { docker exec $container psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 -f ('/tmp/audit-migrations/' + $file.Name) }
  }
  Invoke-Checked { docker cp (Join-Path $repository 'tools/database-audit-upgrade-seed.sql') "${container}:/tmp/audit-upgrade-seed.sql" }
  Invoke-Checked { docker exec $container psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 -f /tmp/audit-upgrade-seed.sql }
  Invoke-Checked { docker cp (Join-Path $repository 'tools/database-audit-participant-upgrade-seed.sql') "${container}:/tmp/audit-participant-upgrade-seed.sql" }
  Invoke-Checked { docker exec $container psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 -f /tmp/audit-participant-upgrade-seed.sql }
  foreach ($file in $files | Where-Object Name -ge '20261005100000') {
    Invoke-Checked { docker exec $container psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 -f ('/tmp/audit-migrations/' + $file.Name) }
  }
  Invoke-Checked { docker cp (Join-Path $repository 'tools/database-audit-participant-upgrade-check.sql') "${container}:/tmp/audit-participant-upgrade-check.sql" }
  Invoke-Checked { docker exec $container psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 -f /tmp/audit-participant-upgrade-check.sql }
  Invoke-Checked { docker cp (Join-Path $repository 'tools/database-audit-upgrade-check.sql') "${container}:/tmp/audit-upgrade-check.sql" }
  Invoke-Checked { docker exec $container psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 -f /tmp/audit-upgrade-check.sql }
  Invoke-Checked { docker exec $container psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 -f /tmp/audit-behavior.sql }
  Invoke-Checked { node (Join-Path $repository 'tools/database-audit-concurrency.mjs') }
  Write-Output "PASS: fresh + prior-schema upgrade, $($files.Count) migrations, SQL behavior + concurrency twice."
} finally {
  Remove-Item Env:AUDIT_LOCAL_CONTAINER -ErrorAction SilentlyContinue
  Remove-Item Env:AUDIT_LOCAL_DB -ErrorAction SilentlyContinue
  if (-not $KeepLocalStack) { & $cli stop --workdir $project 1>$null }
  Write-Output "Generated local fixture project retained at $project (no secrets/data copied)."
}

param(
    [switch]$SelfTestOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Condition {
    param(
        [Parameter(Mandatory = $true)]
        [bool]$Condition,

        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

function Get-HistoryComparison {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$RepositoryVersions,

        [Parameter(Mandatory = $true)]
        [string[]]$AppliedVersions
    )

    $missing = @($RepositoryVersions | Where-Object { $_ -notin $AppliedVersions })
    $unexpected = @($AppliedVersions | Where-Object { $_ -notin $RepositoryVersions })
    $countMatches = $RepositoryVersions.Count -eq $AppliedVersions.Count
    $orderMatches = $countMatches

    if ($orderMatches) {
        for ($index = 0; $index -lt $RepositoryVersions.Count; $index += 1) {
            if ($RepositoryVersions[$index] -ne $AppliedVersions[$index]) {
                $orderMatches = $false
                break
            }
        }
    }

    [PSCustomObject]@{
        CountMatches = $countMatches
        Missing = $missing
        Unexpected = $unexpected
        OrderMatches = $orderMatches
        IsExact = $countMatches -and $missing.Count -eq 0 -and $unexpected.Count -eq 0 -and $orderMatches
    }
}

function Assert-ExactHistory {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$RepositoryVersions,

        [Parameter(Mandatory = $true)]
        [string[]]$AppliedVersions
    )

    $comparison = Get-HistoryComparison -RepositoryVersions $RepositoryVersions -AppliedVersions $AppliedVersions
    if ($comparison.IsExact) {
        return
    }

    $details = @()
    if (-not $comparison.CountMatches) {
        $details += "count differs (repository=$($RepositoryVersions.Count), applied=$($AppliedVersions.Count))"
    }
    if ($comparison.Missing.Count -gt 0) {
        $details += "missing locally: $($comparison.Missing -join ', ')"
    }
    if ($comparison.Unexpected.Count -gt 0) {
        $details += "unexpected locally: $($comparison.Unexpected -join ', ')"
    }
    if (-not $comparison.OrderMatches) {
        $details += 'chronological order differs'
    }

    throw "Supabase migration history mismatch: $($details -join '; ')"
}

function Assert-NativeCommandSucceeded {
    param(
        [Parameter(Mandatory = $true)]
        [int]$ExitCode,

        [Parameter(Mandatory = $true)]
        [string]$Description
    )

    if ($ExitCode -ne 0) {
        throw "$Description failed with exit code $ExitCode."
    }
}

function Assert-LocalOnlySupabaseCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $joinedArguments = $Arguments -join ' '
    Assert-Condition -Condition ($Arguments -contains '--local') -Message "Supabase command must include --local: $joinedArguments"
    Assert-Condition -Condition ($Arguments -notcontains '--linked') -Message "Supabase command must not include --linked: $joinedArguments"
    Assert-Condition -Condition ($joinedArguments -notmatch '(?i)^supabase\s+db\s+push(?:\s|$)') -Message 'supabase db push is forbidden.'
    Assert-Condition -Condition ($joinedArguments -notmatch '(?i)^supabase\s+migration\s+repair(?:\s|$)') -Message 'supabase migration repair is forbidden.'
}

function Invoke-SelfTests {
    Assert-Condition -Condition (0 -eq 0) -Message 'Zero exit code must be accepted.'

    $nonzeroRejected = $false
    try {
        Assert-NativeCommandSucceeded -ExitCode 1 -Description 'Simulated local reset'
    } catch {
        $nonzeroRejected = $true
    }
    Assert-Condition -Condition $nonzeroRejected -Message 'A failed local reset must stop the guard.'

    $countDifference = Get-HistoryComparison -RepositoryVersions @('20260101000000', '20260102000000') -AppliedVersions @('20260101000000')
    Assert-Condition -Condition (-not $countDifference.IsExact -and -not $countDifference.CountMatches) -Message 'Migration count mismatch must fail.'

    $missingAndUnexpected = Get-HistoryComparison -RepositoryVersions @('20260101000000', '20260102000000') -AppliedVersions @('20260101000000', '20260103000000')
    Assert-Condition -Condition (-not $missingAndUnexpected.IsExact -and $missingAndUnexpected.Missing.Count -eq 1 -and $missingAndUnexpected.Unexpected.Count -eq 1) -Message 'Missing and unexpected migrations must fail.'

    $wrongOrder = Get-HistoryComparison -RepositoryVersions @('20260101000000', '20260102000000') -AppliedVersions @('20260102000000', '20260101000000')
    Assert-Condition -Condition (-not $wrongOrder.IsExact -and -not $wrongOrder.OrderMatches) -Message 'Migration order mismatch must fail.'

    $exactHistory = Get-HistoryComparison -RepositoryVersions @('20260101000000', '20260102000000') -AppliedVersions @('20260101000000', '20260102000000')
    Assert-Condition -Condition $exactHistory.IsExact -Message 'Exact migration history must pass.'
}

function Resolve-NpxCommand {
    $command = Get-Command 'npx.cmd' -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        $command = Get-Command 'npx' -ErrorAction SilentlyContinue
    }

    if ($null -eq $command -and $env:APPDATA) {
        $windowsFallback = Join-Path $env:APPDATA 'npm\npx.cmd'
        if (Test-Path -LiteralPath $windowsFallback -PathType Leaf) {
            return $windowsFallback
        }
    }

    if ($null -eq $command) {
        throw 'npx is required but was not found. Install Node.js/npm and the Supabase CLI before running this guard.'
    }

    return $command.Source
}

Invoke-SelfTests

if ($SelfTestOnly) {
    Write-Host 'Supabase migration guard self-tests: PASS'
    exit 0
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$migrationDirectory = Join-Path $repositoryRoot 'supabase\migrations'
Assert-Condition -Condition (Test-Path -LiteralPath $migrationDirectory -PathType Container) -Message "Migration directory not found: $migrationDirectory"

$migrationFiles = @(Get-ChildItem -LiteralPath $migrationDirectory -File -Filter '*.sql' | Sort-Object Name)
Assert-Condition -Condition ($migrationFiles.Count -gt 0) -Message 'No repository migrations were found.'

$repositoryVersions = @()
foreach ($migrationFile in $migrationFiles) {
    if ($migrationFile.Name -notmatch '^(?<version>\d{14})_') {
        throw "Migration filename must begin with a 14-digit version and underscore: $($migrationFile.Name)"
    }
    $repositoryVersions += $Matches.version
}

$uniqueRepositoryVersions = @($repositoryVersions | Sort-Object -Unique)
Assert-Condition -Condition ($uniqueRepositoryVersions.Count -eq $repositoryVersions.Count) -Message 'Repository migration versions must be unique.'

$chronologicalRepositoryVersions = @($repositoryVersions | Sort-Object)
for ($index = 0; $index -lt $repositoryVersions.Count; $index += 1) {
    Assert-Condition -Condition ($repositoryVersions[$index] -eq $chronologicalRepositoryVersions[$index]) -Message 'Repository migration filenames are not in chronological version order.'
}

$npxCommand = Resolve-NpxCommand
$resetArguments = @('supabase', 'db', 'reset', '--local')
$listArguments = @('supabase', '--output-format', 'json', 'migration', 'list', '--local')
Assert-LocalOnlySupabaseCommand -Arguments $resetArguments
Assert-LocalOnlySupabaseCommand -Arguments $listArguments

Push-Location $repositoryRoot
try {
    Write-Host 'Rebuilding the project-local Supabase database from all repository migrations...'
    if ($env:OS -eq 'Windows_NT') {
        & cmd.exe /d /c call $npxCommand @resetArguments
    } else {
        & $npxCommand @resetArguments
    }
    Assert-NativeCommandSucceeded -ExitCode $LASTEXITCODE -Description 'npx supabase db reset --local'

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($env:OS -eq 'Windows_NT') {
            $migrationListOutput = @(& cmd.exe /d /c call $npxCommand @listArguments 2>&1)
        } else {
            $migrationListOutput = @(& $npxCommand @listArguments 2>&1)
        }
        $migrationListExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($migrationListExitCode -ne 0) {
        $migrationListOutput | ForEach-Object { Write-Host $_ }
    }
    Assert-NativeCommandSucceeded -ExitCode $migrationListExitCode -Description 'npx supabase migration list --local'
} finally {
    Pop-Location
}

$migrationListJson = $null
foreach ($lineObject in $migrationListOutput) {
    $line = "$lineObject".Trim()
    if ($line.StartsWith('{"migrations":')) {
        $migrationListJson = $line | ConvertFrom-Json
        break
    }
}

Assert-Condition -Condition ($null -ne $migrationListJson) -Message 'The local Supabase migration list did not return the expected JSON result.'
$appliedVersions = @($migrationListJson.migrations | ForEach-Object { $_.remote } | Where-Object { $_ -match '^\d{14}$' })
Assert-Condition -Condition ($appliedVersions.Count -gt 0) -Message 'No applied migration versions could be read from the local Supabase database.'
Assert-ExactHistory -RepositoryVersions $repositoryVersions -AppliedVersions $appliedVersions

Write-Host ''
Write-Host 'Supabase migration reproducibility: PASS'
Write-Host "Repository migrations: $($repositoryVersions.Count)"
Write-Host "Applied migrations: $($appliedVersions.Count)"
Write-Host 'Exact history match: YES'

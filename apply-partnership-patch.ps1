$ErrorActionPreference = "Stop"

$projectRoot = "C:\Users\delvitech\Desktop\Projects\DEBORAH\VulcanIQ\releases\develop\_patch_backup"
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Set-Location $projectRoot

Copy-Item (Join-Path $sourceRoot "main.jsx") ".\src\main.jsx" -Force
Copy-Item (Join-Path $sourceRoot "styles.css") ".\src\styles.css" -Force

npm run build

Get-ChildItem -Recurse -File | Where-Object { $_.FullName -notmatch '\\node_modules\\|\\dist\\|\\.git\\' } | Select-String -Pattern '<<<<<<<|=======|>>>>>>>'

git status

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root   = Resolve-Path "$PSScriptRoot\.."
$Dist   = Join-Path $Root "dist"

Write-Host "=== CSTS Build Script (PowerShell) ===" -ForegroundColor Cyan
Write-Host "Root: $Root"

# Build frontend
Write-Host "`n[1/4] Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location (Join-Path $Root "frontend")
npm install --legacy-peer-deps --silent

Write-Host "[2/4] Building React frontend..." -ForegroundColor Yellow
npm run build
Write-Host "  ✅ Frontend build complete: frontend\build\" -ForegroundColor Green

# Backend
Write-Host "`n[3/4] Installing backend production dependencies..." -ForegroundColor Yellow
Set-Location (Join-Path $Root "backend")
npm install --production --silent
Write-Host "  ✅ Backend ready" -ForegroundColor Green

# Package artifact
Write-Host "`n[4/4] Packaging artifact..." -ForegroundColor Yellow
if (Test-Path $Dist) { Remove-Item -Recurse -Force $Dist }
New-Item -ItemType Directory -Force -Path "$Dist\public", "$Dist\server" | Out-Null

Copy-Item -Recurse -Path (Join-Path $Root "frontend\build\*") -Destination "$Dist\public\"

Get-ChildItem (Join-Path $Root "backend") |
  Where-Object { $_.Name -notin @('node_modules', '.env') -and $_.Extension -ne '.sqlite' } |
  Copy-Item -Destination "$Dist\server\" -Recurse -Force

Set-Location "$Dist\server"
npm install --production --silent
Set-Location $Root

Write-Host "`n=== Build complete ===" -ForegroundColor Cyan
Write-Host "  Artifact : $Dist"
Write-Host "  Start    : `$env:NODE_ENV='production'; node dist\server\server.js"
Write-Host "  Serve UI : dist\public\ via Express static or CDN"

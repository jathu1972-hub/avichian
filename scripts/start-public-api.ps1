# Start backend (if needed) + Cloudflare quick tunnel, then point both frontends at it.
# This is the TEMPORARY public connectivity path for GitHub Pages demos.
# Permanent: deploy backend to Render/Railway (see PERMANENT_PRODUCTION.md).
#
# Usage (from monorepo root):
#   powershell -ExecutionPolicy Bypass -File .\scripts\start-public-api.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'

Write-Host '=== AVICHIAN public API (tunnel) ==='

# 1) Backend on :4000
$up = $false
try {
  $null = Invoke-RestMethod 'http://127.0.0.1:4000/api/health' -TimeoutSec 3
  $up = $true
  Write-Host 'Backend already running on :4000'
} catch {
  Write-Host 'Starting backend...'
  Start-Process -FilePath 'npm' -ArgumentList 'run','dev','-w','backend' -WorkingDirectory $root -WindowStyle Minimized
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
      $null = Invoke-RestMethod 'http://127.0.0.1:4000/api/health' -TimeoutSec 2
      $up = $true
      break
    } catch { }
  }
}
if (-not $up) {
  Write-Error 'Backend did not start on port 4000. Check PostgreSQL and backend logs.'
  exit 1
}

# 2) Tunnel
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
$log = Join-Path $env:TEMP 'avichian-cloudflared.log'
if (Test-Path $log) { Remove-Item $log -Force }
$cf = Start-Process -FilePath 'npx' -ArgumentList '--yes','cloudflared','tunnel','--url','http://127.0.0.1:4000' `
  -WorkingDirectory $root -RedirectStandardOutput $log -RedirectStandardError $log -PassThru -WindowStyle Hidden

$tunnel = $null
for ($i = 0; $i -lt 45; $i++) {
  Start-Sleep -Seconds 1
  if (-not (Test-Path $log)) { continue }
  $text = Get-Content $log -Raw -ErrorAction SilentlyContinue
  if ($text -match 'https://([a-z0-9-]+\.trycloudflare\.com)') {
    $tunnel = "https://$($Matches[1])"
    break
  }
}
if (-not $tunnel) {
  Write-Error "Cloudflare tunnel did not start. See $log"
  exit 1
}

Write-Host "Tunnel: $tunnel"

# 3) Point frontends
$json = "{`r`n  `"apiUrl`": `"$tunnel`"`r`n}`r`n"
$paths = @(
  (Join-Path $root 'apps\student-app\public\config.json'),
  (Join-Path $root 'apps\super-admin-portal\public\config.json'),
  'C:\Users\GOD\github-exports\avichian-student-app\public\config.json',
  'C:\Users\GOD\github-exports\avichian-superadmin\public\config.json'
)
foreach ($p in $paths) {
  if (Test-Path (Split-Path $p -Parent)) {
    [IO.File]::WriteAllText($p, $json)
    Write-Host "Updated $p"
  }
}

# 4) Health via tunnel
try {
  $h = Invoke-RestMethod "$tunnel/api/health" -TimeoutSec 15
  Write-Host "Health via tunnel: $($h | ConvertTo-Json -Compress)"
} catch {
  Write-Warning "Tunnel URL not healthy yet: $_"
}

Write-Host ''
Write-Host 'NEXT: push GitHub Pages configs so the public site uses this tunnel:'
Write-Host '  cd C:\Users\GOD\github-exports\avichian-student-app'
Write-Host '  git add public/config.json && git commit -m "API tunnel" && git push'
Write-Host '  cd C:\Users\GOD\github-exports\avichian-superadmin'
Write-Host '  git add public/config.json && git commit -m "API tunnel" && git push'
Write-Host ''
Write-Host 'Student: https://jathu1972-hub.github.io/avichian-student-app/#/login'
Write-Host 'Admin:   https://jathu1972-hub.github.io/avichian-superadmin/#/login'
Write-Host "Keep this PC awake. Tunnel PID: $($cf.Id)"
Write-Host $tunnel

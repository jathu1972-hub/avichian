# Point both GitHub Pages frontends at a permanent hosted API.
# Usage:
#   .\scripts\point-frontends-to-api.ps1 -ApiOrigin "https://avichian-api.onrender.com"
#
# Then commit/push github-exports student + superadmin (or monorepo apps/*/public/config.json).

param(
  [Parameter(Mandatory = $true)]
  [string]$ApiOrigin
)

$origin = $ApiOrigin.Trim().TrimEnd('/')
if ($origin -match '/api$') {
  $origin = $origin -replace '/api$', ''
}

if ($origin -match 'localhost|127\.0\.0\.1') {
  Write-Error "Refusing localhost API for production config: $origin"
  exit 1
}

$json = "{`r`n  `"apiUrl`": `"$origin`"`r`n}`r`n"
$paths = @(
  "C:\Users\GOD\avichian\apps\student-app\public\config.json",
  "C:\Users\GOD\avichian\apps\super-admin-portal\public\config.json",
  "C:\Users\GOD\github-exports\avichian-student-app\public\config.json",
  "C:\Users\GOD\github-exports\avichian-superadmin\public\config.json"
)

foreach ($p in $paths) {
  $dir = Split-Path $p -Parent
  if (-not (Test-Path $dir)) { continue }
  [IO.File]::WriteAllText($p, $json)
  Write-Host "Updated $p"
}

$envProd = "VITE_API_URL=$origin/api`r`n"
foreach ($p in @(
  "C:\Users\GOD\avichian\apps\student-app\.env.production",
  "C:\Users\GOD\avichian\apps\super-admin-portal\.env.production",
  "C:\Users\GOD\github-exports\avichian-student-app\.env.production",
  "C:\Users\GOD\github-exports\avichian-superadmin\.env.production"
)) {
  $dir = Split-Path $p -Parent
  if (-not (Test-Path $dir)) { continue }
  [IO.File]::WriteAllText($p, $envProd)
  Write-Host "Updated $p"
}

Write-Host ""
Write-Host "Next:"
Write-Host "  1. git commit + push avichian-student-app and avichian-superadmin"
Write-Host "  2. On Render, set PUBLIC_API_URL=$origin and FRONTEND_URLS=https://jathu1972-hub.github.io"
Write-Host "  3. Open health: $origin/api/health"
Write-Host "  4. Login: https://jathu1972-hub.github.io/avichian-student-app/#/login"

param(
  [string]$PostgresPassword = $env:POSTGRES_PASSWORD,
  [int]$Port = 5432
)

$ErrorActionPreference = "Continue"
$Root = "C:\Users\GOD\avichian"
$HbaPath = "C:\Program Files\PostgreSQL\18\data\pg_hba.conf"
$Psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$PgCtl = "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe"
$DataDir = "C:\Program Files\PostgreSQL\18\data"

function Invoke-Psql {
  param([string]$Sql)
  if ($PostgresPassword) { $env:PGPASSWORD = $PostgresPassword }
  else { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
  & $Psql -U postgres -h localhost -p $Port -d postgres -c $Sql 2>&1
}

function Enable-TrustAuth {
  if (-not (Test-Path $HbaPath)) { return $false }
  $backup = "$HbaPath.avichian.bak"
  if (-not (Test-Path $backup)) { Copy-Item $HbaPath $backup -Force }
  (Get-Content $HbaPath -Raw).Replace('scram-sha-256', 'trust') | Set-Content $HbaPath -NoNewline
  & $PgCtl reload -D $DataDir | Out-Null
  Start-Sleep -Seconds 2
  return $true
}

function Restore-Auth {
  $backup = "$HbaPath.avichian.bak"
  if (Test-Path $backup) {
    Copy-Item $backup $HbaPath -Force
    & $PgCtl reload -D $DataDir | Out-Null
  }
}

Write-Host "Setting up Avichian database on port $Port..."

$usedTrust = $false
if (-not $PostgresPassword) {
  Write-Host "Using temporary trust auth for local setup..."
  $usedTrust = Enable-TrustAuth
}

try {
  Invoke-Psql "CREATE USER avichian WITH PASSWORD 'avichian';"
  Invoke-Psql "CREATE DATABASE avichian OWNER avichian;"
  Invoke-Psql "GRANT ALL PRIVILEGES ON DATABASE avichian TO avichian;"

  Copy-Item "$Root\.env" "$Root\backend\.env" -Force
  $nodePath = "C:\Users\GOD\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin"
  if (Test-Path "C:\Program Files\nodejs") {
    $env:Path = "C:\Program Files\nodejs;$nodePath;" + $env:Path
  } else {
    $env:Path = "$nodePath;" + $env:Path
  }

  Set-Location $Root
  npm.cmd run db:push -w backend
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Write-Host "Success. Database avichian is ready."
}
finally {
  if ($usedTrust) {
    Write-Host "Restoring pg_hba.conf..."
    Restore-Auth
  }
}
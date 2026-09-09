<#
.SYNOPSIS
  Faz backup diario do banco Postgres local (Chamados) em formato custom do pg_dump.
  Mantem os ultimos 14 backups e apaga os mais antigos automaticamente.
#>

$ErrorActionPreference = 'Stop'

$pgDump = 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe'
$backupDir = 'C:\Backups\Chamados'
$retentionDays = 14

New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

$env:PGPASSWORD = '123456'
$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm'
$outFile = Join-Path $backupDir "chamados_$timestamp.dump"

& $pgDump -U postgres -h localhost -p 5432 -d Chamados -F c -f $outFile

Get-ChildItem $backupDir -Filter '*.dump' |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$retentionDays) } |
  Remove-Item -Force

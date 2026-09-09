<#
.SYNOPSIS
  Sobe o backend local (Node/Express + PostgreSQL local) e expoe ele na
  internet via Cloudflare Tunnel (quick tunnel, sem dominio proprio),
  para o site publicado no Netlify conseguir falar com ele.

.USAGE
  cd Appchamados
  .\scripts\start-local-tunnel.ps1

  Para tambem atualizar automaticamente a variavel VITE_API_URL no Netlify
  e disparar um novo deploy (requer Netlify CLI logado e site linkado):
  .\scripts\start-local-tunnel.ps1 -UpdateNetlify
#>

param(
  [switch]$UpdateNetlify
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Test-Command($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

if (-not (Test-Command 'cloudflared')) {
  Write-Error "cloudflared nao encontrado no PATH. Instale com 'winget install --id Cloudflare.cloudflared' e reabra o terminal."
  exit 1
}

if (-not (Test-Path '.\.env')) {
  Write-Error "Arquivo .env nao encontrado em $root. Copie/ajuste o .env antes de continuar."
  exit 1
}

Write-Host "==> Iniciando backend local (porta 4000)..." -ForegroundColor Cyan
$backend = Start-Process -FilePath 'node' -ArgumentList 'server/index.js' -PassThru -WindowStyle Minimized -RedirectStandardOutput 'server-local.log' -RedirectStandardError 'server-local.err.log'

Write-Host "==> Aguardando o backend responder em http://localhost:4000/api/health ..." -ForegroundColor Cyan
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  try {
    $resp = Invoke-WebRequest -Uri 'http://localhost:4000/api/health' -UseBasicParsing -TimeoutSec 2
    if ($resp.StatusCode -eq 200) { $ready = $true; break }
  } catch { }
}

if (-not $ready) {
  Write-Error "Backend nao respondeu apos 30s. Veja server-local.err.log para detalhes."
  exit 1
}

Write-Host "==> Backend OK. Abrindo Cloudflare Tunnel (quick tunnel)..." -ForegroundColor Cyan
$tunnelLog = 'cloudflared-local.log'
Remove-Item $tunnelLog -ErrorAction SilentlyContinue
$tunnel = Start-Process -FilePath 'cloudflared' -ArgumentList 'tunnel', '--url', 'http://localhost:4000' -PassThru -WindowStyle Minimized -RedirectStandardOutput $tunnelLog -RedirectStandardError $tunnelLog

$publicUrl = $null
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $tunnelLog) {
    $match = Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches | Select-Object -First 1
    if ($match) { $publicUrl = $match.Matches[0].Value; break }
  }
}

if (-not $publicUrl) {
  Write-Error "Nao consegui capturar a URL do cloudflared. Veja $tunnelLog manualmente."
  exit 1
}

Write-Host ""
Write-Host "==> Backend publico (temporario): $publicUrl" -ForegroundColor Green
Write-Host "==> URL da API para o Netlify: $publicUrl/api" -ForegroundColor Green
Write-Host ""
Write-Host "Essa URL muda toda vez que este script eh reiniciado." -ForegroundColor Yellow
Write-Host "Atualize a variavel VITE_API_URL no Netlify (Site settings > Environment variables)" -ForegroundColor Yellow
Write-Host "e dispare um novo deploy para o site voltar a falar com o backend." -ForegroundColor Yellow

if ($UpdateNetlify) {
  if (Test-Command 'netlify') {
    Write-Host "==> Atualizando VITE_API_URL no Netlify e disparando deploy..." -ForegroundColor Cyan
    netlify env:set VITE_API_URL "$publicUrl/api" --context production
    netlify deploy --build --prod
  } else {
    Write-Warning "Netlify CLI nao encontrada. Instale com 'npm install -g netlify-cli', rode 'netlify login' e 'netlify link' antes de usar -UpdateNetlify."
  }
}

Write-Host ""
Write-Host "Pressione CTRL+C nesta janela para encerrar backend + tunnel." -ForegroundColor Cyan
Wait-Process -Id $backend.Id

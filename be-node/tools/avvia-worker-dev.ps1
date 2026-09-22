<#
  Avvia su questa macchina il worker di velia-dev al posto di quello di Render
  (22/09/2026): Claude Code completo in chat, quattro domande alla volta, il
  LibreOffice della macchina, niente Docker. Le variabili le imposta qui e in
  `worker-claude-code.ts`: il file .env non si tocca.

  Uso, da una PowerShell qualsiasi:
    & "C:\Users\Administrator\Desktop\GIT\BLUSAIL\assieme\be-node\tools\avvia-worker-dev.ps1"
  se i criteri di esecuzione lo bloccano:
    powershell -ExecutionPolicy Bypass -File "C:\Users\Administrator\Desktop\GIT\BLUSAIL\assieme\be-node\tools\avvia-worker-dev.ps1"

  Con -Locale lavora invece sulla coda della macchina (lavori_locale, quella
  dello stack locale), coi valori del .env.

  Prima di avviarlo per velia-dev, velia-worker su Render va sospeso: con
  tutti e due accesi i job si dividono a caso. Ctrl+C lo ferma; se si ferma
  da solo per un errore riparte dopo 5 secondi.
#>
param([switch]$Locale)

$ErrorActionPreference = 'Stop'
$beNode = Split-Path -Parent $PSScriptRoot

if ($Locale) {
  # Lanciato prima per velia-dev nella stessa finestra: quelle variabili non devono restare.
  Remove-Item Env:CODA_LAVORI, Env:BASE_LINK_PAGINE, Env:EMAIL_MITTENTE -ErrorAction SilentlyContinue
  Write-Host 'Worker di questa macchina sulla coda locale (lavori_locale).' -ForegroundColor Cyan
} else {
  $env:CODA_LAVORI = 'lavori'
  $env:BASE_LINK_PAGINE = 'https://api-dev.sonovelia.it'
  $env:EMAIL_MITTENTE = 'Velia <noreply@sonovelia.it>'
  Write-Host 'Worker di questa macchina per velia-dev (code lavori e lavori_chat).' -ForegroundColor Cyan
  Write-Host 'velia-worker su Render deve essere sospeso.' -ForegroundColor Yellow
}
Write-Host ('Codice: ' + (git -C $beNode log -1 --format='%h %s (%cr)'))

Push-Location $beNode
try {
  while ($true) {
    npm run worker:claude-code
    # Uscita pulita (Ctrl+C, SIGTERM): ci si ferma. Un errore: si riparte.
    if ($LASTEXITCODE -eq 0) { break }
    Write-Host "Il worker si e' fermato (uscita $LASTEXITCODE): riparto fra 5 secondi." -ForegroundColor Red
    Start-Sleep -Seconds 5
  }
} finally {
  Pop-Location
}

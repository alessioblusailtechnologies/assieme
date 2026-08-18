# Lancia un'interrogazione del motore agentico sul workspace e ne stampa le
# misure. Ogni esecuzione salva il JSON grezzo in risultati/, che è il
# materiale per le decisioni aperte del documento di architettura.
#
# Uso:
#   .\interroga.ps1 -Domanda "Confronta le esclusioni della garanzia cristalli"
#   .\interroga.ps1 -Domanda "..." -Model claude-opus-5

param(
  [Parameter(Mandatory = $true)][string]$Domanda,
  [string]$Model = 'claude-sonnet-5'
)

$qui = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspace = Join-Path $qui 'workspace'
$risultati = Join-Path $qui 'risultati'
New-Item -ItemType Directory -Force $risultati | Out-Null

# Solo tool di lettura: il motore naviga, non modifica (motore agentico §2).
Push-Location $workspace
try {
  $inizio = Get-Date
  $righe = claude -p $Domanda `
    --model $Model `
    --output-format json `
    --allowedTools "Read,Grep,Glob" `
    --disallowedTools "Bash,Write,Edit,NotebookEdit,WebFetch,WebSearch,Task"
  $durataTotale = (Get-Date) - $inizio
}
finally {
  Pop-Location
}

$grezzo = $righe -join "`n"
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$file = Join-Path $risultati "$timestamp.json"
$grezzo | Out-File $file -Encoding utf8

$r = $grezzo | ConvertFrom-Json

Write-Host ''
Write-Host '=== RISPOSTA ===' -ForegroundColor Cyan
Write-Host $r.result
Write-Host ''
Write-Host '=== MISURE ===' -ForegroundColor Cyan
Write-Host ("Modello:       {0}" -f $Model)
Write-Host ("Turni:         {0}" -f $r.num_turns)
Write-Host ("Durata API:    {0:n1} s (end-to-end {1:n1} s)" -f ($r.duration_api_ms / 1000), $durataTotale.TotalSeconds)
Write-Host ("Costo:         {0:n4} USD" -f $r.total_cost_usd)
Write-Host ("Token input:   {0} diretti + {1} letti da cache" -f $r.usage.input_tokens, $r.usage.cache_read_input_tokens)
Write-Host ("Token output:  {0}" -f $r.usage.output_tokens)
Write-Host ("Salvato in:    {0}" -f $file)

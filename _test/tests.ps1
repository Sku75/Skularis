# Skularis — alle Prüfungen ohne zusätzliche Software.
# Genutzt wird die Node-Laufzeit, die in Skularis.exe steckt.
#
# Wichtig: Skularis.exe ist ein Windows-GUI-Programm. Ohne Weiterleitung der
# Ausgabe in die Pipeline wartet PowerShell nicht auf das Ende und $LASTEXITCODE
# stimmt nicht. Deshalb läuft jeder Aufruf über starte().

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$app  = Split-Path -Parent $PSScriptRoot
$wurz = Split-Path -Parent (Split-Path -Parent $app)
$exe  = Join-Path $wurz 'Skularis.exe'
$pkg  = Join-Path $app 'package.json'
$sich = Join-Path $app 'package.json.sicherung'

if (-not (Test-Path $exe)) { Write-Output "Skularis.exe nicht gefunden: $exe"; exit 1 }

$script:fehler = 0
$script:gesamtUhr = [System.Diagnostics.Stopwatch]::StartNew()
$script:stufenUhr = $null
$script:letzterTitel = ''

function Titel($t) {
  if ($script:stufenUhr) {
    Write-Output ("   ... {0} nach {1:N0} Sekunden fertig." -f $script:letzterTitel, $script:stufenUhr.Elapsed.TotalSeconds)
  }
  Write-Output ''
  Write-Output $t
  $script:letzterTitel = $t
  $script:stufenUhr = [System.Diagnostics.Stopwatch]::StartNew()
}

# Gibt die Ausgabe des Kindprozesses weiter und legt den Rückgabewert in
# $script:letzterCode ab. Kein return, sonst landet die Ausgabe im Rückgabewert.
$script:letzterCode = 0
function starte($argumente) {
  & $exe @argumente 2>&1 | ForEach-Object { Write-Output $_ }
  $script:letzterCode = $LASTEXITCODE
}

function pruefeCode { if ($script:letzterCode -ne 0) { $script:fehler++ } }

Titel 'Syntax aller Quelldateien'
$env:ELECTRON_RUN_AS_NODE = '1'
starte @((Join-Path $PSScriptRoot 'syntaxcheck.js'), $app, $exe); pruefeCode

Titel 'Importe und Exporte'
starte @((Join-Path $PSScriptRoot 'import-check.mjs'), $app); pruefeCode

Titel 'Rechenkern, Speicherformat, HTML-Export'
starte @((Join-Path $PSScriptRoot 'engine-test.mjs'), $app); pruefeCode
Remove-Item Env:\ELECTRON_RUN_AS_NODE

# Die Bildschirm-Tests brauchen einen echten Renderer. Dafür wird der
# Einstiegspunkt in package.json kurz umgebogen und danach wiederhergestellt.
function StarteSeite($seite, $titel) {
  Titel $titel
  Copy-Item $pkg $sich -Force
  try {
    $roh = [System.IO.File]::ReadAllText($pkg)
    [System.IO.File]::WriteAllText($pkg, $roh.Replace('"main": "main/main.js"', '"main": "_test/rt-main.cjs"'))
    $env:SKU_TESTSEITE = $seite
    starte @()
  } finally {
    Move-Item $sich $pkg -Force
    if (Test-Path Env:\SKU_TESTSEITE) { Remove-Item Env:\SKU_TESTSEITE }
  }
  pruefeCode
}

StarteSeite 'durchreichen.html' 'Durchreichen: fremde Dateien zeichengenau wieder herausschreiben'
StarteSeite 'kompatibilitaet.html' 'Kompatibilitaet mit Sephrasto in beide Richtungen'
StarteSeite 'vorlagen.html' 'Heldenvorlagen und ihre Steckbriefe'
StarteSeite 'tooltip.html' 'Info-Fenster: Tooltip und Info-Modus'
StarteSeite 'tooltip-durchzug.html' 'Tooltip zieht sich durch alle Menues'
StarteSeite 'pakete.html' 'Erschaffungspakete gegen Sephrastos eigene EP-Angabe'
StarteSeite 'smoke.html' 'Assistent und freier Editor (echte Bildschirme)'

Write-Output ("   ... {0} nach {1:N0} Sekunden fertig." -f $script:letzterTitel, $script:stufenUhr.Elapsed.TotalSeconds)
Write-Output ''
if ($script:fehler -eq 0) { Write-Output 'Alle Pruefungen bestanden.' }
else { Write-Output "$($script:fehler) Pruefungen mit Fehlern." }
Write-Output ("Gesamtdauer: {0:N0} Sekunden." -f $script:gesamtUhr.Elapsed.TotalSeconds)
exit $script:fehler

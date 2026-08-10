@echo off
for /d %%D in ("%~dp0Skularis *") do (
  if exist "%%~fD\Skularis.exe" (
    rem Updater beim Start automatisch aktuell halten: die aktuelle Fassung liegt im
    rem Programmordner und wird an die Wurzel kopiert. So bekommt man den neuesten
    rem Updater ganz ohne erneuten Download. Fehler werden bewusst ignoriert.
    if exist "%%~fD\resources\app\updater\Skularis Updaten.exe" copy /y "%%~fD\resources\app\updater\Skularis Updaten.exe" "%~dp0Skularis Updaten.exe" >nul 2>&1
    start "" "%%~fD\Skularis.exe"
    goto :eof
  )
)
echo Skularis wurde nicht gefunden. Bitte Skularis Updaten ausfuehren.
pause

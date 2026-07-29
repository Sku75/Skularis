@echo off
for /d %%D in ("%~dp0Skularis *") do (
  if exist "%%~fD\Skularis.exe" (
    start "" "%%~fD\Skularis.exe"
    goto :eof
  )
)
echo Skularis wurde nicht gefunden. Bitte Skularis Updaten ausfuehren.
pause

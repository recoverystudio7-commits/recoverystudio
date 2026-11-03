@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo No se encontro Node.js. Instala la version LTS desde https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo.
echo Iniciando Recovery Studio...
echo Direccion: http://localhost:3000
echo Para detener el servidor presiona Ctrl+C.
echo.
start "" http://localhost:3000
node server.js
pause

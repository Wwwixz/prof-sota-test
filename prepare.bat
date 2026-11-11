@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Для подготовки установите Node.js 22 или новее.
  pause
  exit /b 1
)
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto error
call npm.cmd run build
if errorlevel 1 goto error
echo Подготовка завершена. Для публичного доступа заранее установите cloudflared.
echo На мероприятиях запускайте только start.bat.
pause
exit /b 0
:error
echo Подготовка не завершена. Проверьте интернет и сообщения выше.
pause
exit /b 1

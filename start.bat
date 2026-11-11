@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo На этом ноутбуке нужно один раз установить Node.js 22 или новее.
  echo После установки выполните prepare.bat. На выездах запускайте только start.bat.
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<22)process.exit(1)"
if errorlevel 1 (
  echo Нужен Node.js 22 или новее.
  pause
  exit /b 1
)
node -e "for(const name of ['ws','qrcode','zod'])require.resolve(name)" >nul 2>nul
if errorlevel 1 (
  echo Ноутбук ещё не подготовлен. Один раз выполните prepare.bat с интернетом.
  pause
  exit /b 1
)
node scripts\launch.cjs
if errorlevel 1 (
  echo Запуск завершился с ошибкой. Проверьте сообщения выше.
  pause
)

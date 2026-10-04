@echo off
chcp 65001 >nul
title BosvEr - Otopark Sunucusu
cd /d "%~dp0"

set "PATH=C:\Program Files\nodejs;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi.
  echo https://nodejs.org adresinden kurun, sonra bu dosyayi tekrar calistirin.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Paketler kuruluyor, ilk acilis biraz surebilir...
  call npm install
  if errorlevel 1 (
    echo Paket kurulumu basarisiz oldu.
    pause
    exit /b 1
  )
)

echo.
echo BosvEr baslatiliyor...
echo Tarayicida acin: http://localhost:3000
echo Kapatmak icin bu pencereyi kapatin veya Ctrl+C.
echo.

start "" http://localhost:3000
node server.js

echo.
echo Sunucu durdu.
pause

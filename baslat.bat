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
echo Adres sunucu acilinca asagida yazacak (localhost degil, bilgisayarinin IP'si).
echo Kapatmak icin bu pencereyi kapatin veya Ctrl+C.
echo.

for /f "usebackq delims=" %%i in (`node -e "const os=require('os');const p=process.env.PORT||3000;for (const n of Object.values(os.networkInterfaces())) for (const a of n||[]) if ((a.family===4||a.family==='IPv4')&&!a.internal){console.log('http://'+a.address+':'+p);process.exit(0)} console.log('http://127.0.0.1:'+p)"`) do (
  echo Tarayicida acin: %%i
  start "" "%%i"
)

node server.js

echo.
echo Sunucu durdu.
pause

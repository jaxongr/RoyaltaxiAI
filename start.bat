@echo off
chcp 65001 > nul
title Royaltaxi AI — Hammasini ishga tushirish

echo.
echo ====================================
echo   Royaltaxi AI Dispetcher
echo ====================================
echo.
echo 3 ta jarayon ishga tushadi:
echo   1. Monitor (scraper + Telegram)
echo   2. Dashboard (http://localhost:4000)
echo   3. Server'ga DB sync (har 3 daq)
echo.

cd /d "%~dp0"

REM Eski node processlarni o'chirish (agar ishlamayotgan bo'lsa)
echo Eski jarayonlarni tozalayman...
taskkill /F /IM node.exe /T > nul 2>&1
timeout /t 2 > nul

REM Monitor — yangi cmd
start "Royaltaxi MONITOR" cmd /k "npx tsx src/realtime.ts"
timeout /t 3 > nul

REM Dashboard — yangi cmd
start "Royaltaxi DASHBOARD" cmd /k "npx tsx src/dashboard.ts"
timeout /t 3 > nul

REM Sync — yangi cmd
start "Royaltaxi SYNC" cmd /k "npx tsx src/sync-to-server.ts"
timeout /t 3 > nul

REM Brauzer ochish
start "" "http://localhost:4000"

echo.
echo ====================================
echo   Hammasi ishga tushdi!
echo ====================================
echo.
echo  Lokal dashboard: http://localhost:4000
echo  Server dashboard: http://173.212.216.167
echo  Telegram bot: @Airoyaltaxibot
echo.
echo  Buyruqlar:
echo    /stats  — bugungi statistika
echo    /top    — top shubhali haydovchilar
echo    /blocks — blok tavsiyalari
echo    /help   — yordam
echo.
echo  To'xtatish: har bir oynani Ctrl+C bilan.
echo.
pause

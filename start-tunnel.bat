@echo off
chcp 65001 > nul
title Royaltaxi Tunnel (UY PC ↔ VPS)

echo.
echo ====================================
echo   ROYALTAXI TUNNEL
echo ====================================
echo.
echo  UY PC dan VPS ga shifrlangan tunnel.
echo  VPS sayt'ga uy internet IP'sidan ulanadi.
echo.
echo  Bu oynani YOPMANG! Tunnel ishlatish uchun
echo  doim ochiq turishi kerak.
echo.
echo  Avto-yoqilish: Win+R -^> shell:startup
echo                shu .bat'ni shortcut qiling.
echo.

cd /d "%~dp0"

REM Eski chisel jarayonlarini tozalash
taskkill /F /IM chisel.exe /T > nul 2>&1
timeout /t 1 > nul

REM Tunnel ishga tushirish
echo  Tunnel ulanmoqda...
tools\chisel.exe client --auth tunnel:Jvr2iOpDaV --keepalive 30s --max-retry-interval 10s http://46.8.194.45:8080 R:1080:socks

@echo off
title Royaltaxi Tunnel Installer
chcp 65001 > nul
echo.
echo ============================================
echo   ROYALTAXI TUNNEL — Avto-o'rnatuvchi
echo ============================================
echo.
echo  Hech qanday qo'lda sozlash kerak emas.
echo  Skript hammasini avtomatik bajaradi:
echo.
echo   1. Chisel yuklaydi
echo   2. Windows xizmat sifatida o'rnatadi
echo   3. Avto-startup (reboot bo'lsa o'zi tushadi)
echo.
echo  Admin huquqlari talab qilinadi.
echo.
pause

powershell -ExecutionPolicy Bypass -Command "iwr -useb https://raw.githubusercontent.com/jaxongr/RoyaltaxiAI/main/tools/install-tunnel.ps1 | iex"

echo.
echo Tugadi! Bu oynani yopib qo'ya olasiz.
pause

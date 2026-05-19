@echo off
chcp 65001 >nul
title Royaltaxi Tunnel - O'rnatuvchi
color 0B

echo.
echo ════════════════════════════════════════
echo   ROYALTAXI TUNNEL — PC GA O'RNATISH
echo ════════════════════════════════════════
echo.

REM Admin huquqi kerak — yo'q bo'lsa qayta ishga tushiramiz
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  Admin huquqlari kerak. Tasdiqlash oynasini ko'rsangiz "Ha" bosing...
    echo.
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo  ✓ Admin huquqlari mavjud
echo.
echo  ▶ Internetdan installer yuklab olinmoqda...
echo.

REM Dashboard'dan PowerShell installerni yuklab olib darhol ishlatamiz
powershell -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { iwr 'http://46.8.194.45/install-tunnel.ps1' -UseBasicParsing | iex } catch { Write-Host ' ❌ Xato: ' $_.Exception.Message -ForegroundColor Red ; Read-Host 'Yopish uchun Enter' }"

echo.
echo ════════════════════════════════════════
echo  TAYYOR! Bu oynani yopishingiz mumkin.
echo ════════════════════════════════════════
pause

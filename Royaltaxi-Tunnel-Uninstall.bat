@echo off
title Royaltaxi Tunnel Uninstaller
chcp 65001 > nul
echo.
echo Royaltaxi Tunnel o'chirilmoqda...
echo.

powershell -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-Command \"schtasks /Delete /TN RoyaltaxiTunnel /F; Remove-Item -Path C:\RoyaltaxiTunnel -Recurse -Force -ErrorAction SilentlyContinue; Write-Host OK; Read-Host\"'"

pause

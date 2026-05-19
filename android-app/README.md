# Royaltaxi Tunnel — Android App

Minimal Android APK — telefonni Royaltaxi serverga chisel reverse SOCKS tunel orqali ulaydi.

## Tuzilishi
- Foreground service (`TunnelService`) — chisel binary'ni ishlatadi
- BootReceiver — telefon yongan zahoti avto-start
- WiFi + Wake lock — ekran o'chsa ham ishlash
- chisel binary `jniLibs/` orqali joylanadi (apk extract qiladi)

## Build
GitHub Actions workflow (`.github/workflows/build-android.yml`):
- Push qilingach avto-builds
- APK GitHub Releases'ga ko'tariladi (tag: `tunnel-latest`)

## Konfiguratsiya
Server URL va auth `TunnelService.java` ichida hardcoded:
- `SERVER_URL = "http://46.8.194.45:8080"`
- `AUTH = "tunnel:Jvr2iOpDaV"`

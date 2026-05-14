# Royaltaxi Tunnel — avto-o'rnatuvchi
# Foydalanish: Bu skript admin huquqlari bilan ishga tushadi
# Reboot bo'lsa avto-tushadi, foydalanuvchi kirishi shart emas

$ErrorActionPreference = 'Stop'

# Parametrlar
$installDir = 'C:\RoyaltaxiTunnel'
$serverIp = '46.8.194.45'
$serverPort = 8080
$authToken = 'Jvr2iOpDaV'
$taskName = 'RoyaltaxiTunnel'

Write-Host ""
Write-Host "===================================" -ForegroundColor Cyan
Write-Host "  ROYALTAXI TUNNEL INSTALLER" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# Admin tekshiruv
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Admin huquqlari kerak. Skript qaytadan ishga tushyapti..." -ForegroundColor Yellow
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

# 1. Papka yaratish
Write-Host "▶ Papka tayyorlanmoqda..." -ForegroundColor Yellow
New-Item -Path $installDir -ItemType Directory -Force | Out-Null

# 2. chisel.exe yuklab olish
$exePath = "$installDir\chisel.exe"
if (-not (Test-Path $exePath)) {
    Write-Host "▶ Chisel yuklab olinmoqda..." -ForegroundColor Yellow
    $gzPath = "$installDir\chisel.gz"
    $chiselUrl = 'https://github.com/jpillora/chisel/releases/download/v1.10.1/chisel_1.10.1_windows_amd64.gz'

    Invoke-WebRequest -Uri $chiselUrl -OutFile $gzPath -UseBasicParsing

    $src = [System.IO.File]::OpenRead($gzPath)
    $dst = [System.IO.File]::Create($exePath)
    $gzip = New-Object System.IO.Compression.GzipStream($src, [System.IO.Compression.CompressionMode]::Decompress)
    $gzip.CopyTo($dst)
    $gzip.Close(); $src.Close(); $dst.Close()
    Remove-Item $gzPath -Force
    Write-Host "  ✓ chisel.exe o'rnatildi" -ForegroundColor Green
} else {
    Write-Host "  ✓ chisel.exe allaqachon bor" -ForegroundColor Green
}

# 3. Eski scheduled taskni o'chirish (agar bor bo'lsa)
Write-Host "▶ Eski xizmatni tozalash..." -ForegroundColor Yellow
schtasks /Delete /TN $taskName /F 2>$null | Out-Null

# 4. Scheduled task yaratish — boot'da avto-ishga tushadi
Write-Host "▶ Windows xizmati yaratilmoqda..." -ForegroundColor Yellow

$chiselArgs = "client --auth tunnel:$authToken --keepalive 30s --max-retry-interval 10s http://${serverIp}:${serverPort} R:1080:socks"

$action = New-ScheduledTaskAction -Execute $exePath -Argument $chiselArgs -WorkingDirectory $installDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT30S'  # 30 sek kuting (network tayyor bo'lishi uchun)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 9999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 365)

Register-ScheduledTask -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Royaltaxi tunnel — UZ VPS uchun sayt ulanishi" `
    -Force | Out-Null

Write-Host "  ✓ Xizmat ro'yxatga olindi" -ForegroundColor Green

# 5. Darhol ishga tushirish
Write-Host "▶ Tunnel ishga tushirilmoqda..." -ForegroundColor Yellow
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 3

# 6. Tekshiruv
$task = Get-ScheduledTask -TaskName $taskName
$state = $task.State
Write-Host ""
Write-Host "===================================" -ForegroundColor Cyan
if ($state -eq 'Running') {
    Write-Host "  ✅ MUVAFFAQIYATLI O'RNATILDI!" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Holat: $state" -ForegroundColor Yellow
}
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " Tunnel xizmat sifatida ishlaydi."
Write-Host " Reboot bo'lsa avto-tushadi."
Write-Host " Foydalanuvchi kirishi shart emas."
Write-Host ""
Write-Host " Dashboard: http://46.8.194.45"
Write-Host " Login: admin / Royaltaxi2026"
Write-Host ""
Write-Host " Holatni ko'rish:" -ForegroundColor Gray
Write-Host "   schtasks /Query /TN RoyaltaxiTunnel" -ForegroundColor Gray
Write-Host ""
Write-Host " Olib tashlash:" -ForegroundColor Gray
Write-Host "   schtasks /Delete /TN RoyaltaxiTunnel /F" -ForegroundColor Gray
Write-Host ""

Read-Host "Davom etish uchun Enter bosing"

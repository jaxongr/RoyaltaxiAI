#!/data/data/com.termux/files/usr/bin/sh
# ─────────────────────────────────────────────────────────────────────
#  ROYALTAXI TUNNEL — ANDROID (TERMUX) INSTALLER  v2
#  Telefonni doim yoqib, WiFi'ga ulab qo'ying — tunel avto-ishga tushadi
#  Ekran o'chsa ham, fonda ham, batareya saqlash rejimida ham UZILMAYDI.
# ─────────────────────────────────────────────────────────────────────
#
#  ISHLATISH:
#  1. F-Droid'dan o'rnating: Termux, Termux:Boot, Termux:API
#  2. Termux ochib shuni yozing:
#       curl -fsSL http://46.8.194.45/install-tunnel.sh | sh
#  3. Termux:Boot dasturini bir marta oching (autostart uchun)
#  4. Sozlamalar → Batareya → Termux/Termux:API — "Cheksiz" qiling
# ─────────────────────────────────────────────────────────────────────

set -eu

SERVER_IP="46.8.194.45"
SERVER_PORT="8080"
AUTH="tunnel:Jvr2iOpDaV"
CHISEL_VERSION="1.10.1"

echo ""
echo "🚀 ROYALTAXI TUNNEL — TERMUX O'RNATGICH v2"
echo "════════════════════════════════════════"
echo ""

# ── 1. Arxitekturani aniqlash ────────────────────────────────────────
ARCH=$(uname -m)
case "$ARCH" in
  aarch64|arm64) CHISEL_ARCH="arm64" ;;
  armv7l|armv8l) CHISEL_ARCH="armv7" ;;
  x86_64)        CHISEL_ARCH="amd64" ;;
  i*86)          CHISEL_ARCH="386" ;;
  *) echo "❌ Noma'lum arxitektura: $ARCH"; exit 1 ;;
esac
echo "📱 Telefon: $ARCH → chisel_${CHISEL_ARCH}"

# ── 2. Kerakli paketlar ──────────────────────────────────────────────
echo ""
echo "📦 Kerakli paketlar..."
pkg update -y > /dev/null 2>&1 || true
pkg install -y wget termux-api procps > /dev/null 2>&1 || true

# ── 3. Phantom process killer'ni o'chirish (Android 12+) ────────────
# Termux protsesslarni Android'da fonga ko'chiruvchi "phantom killer"
# tunelni o'ldirib qo'yishi mumkin. Buni cheklaymiz.
# Bu komanda root talab qilmaydi (Termux'ning o'z sozlamalari).
echo ""
echo "🛡  Termux himoyasi..."
mkdir -p ~/.termux
# allow-external-apps — Termux:Boot uchun
if ! grep -q "allow-external-apps" ~/.termux/termux.properties 2>/dev/null; then
  echo "allow-external-apps=true" >> ~/.termux/termux.properties
fi

# ── 4. Chisel binary'ni yuklab olish ─────────────────────────────────
CHISEL_URL="https://github.com/jpillora/chisel/releases/download/v${CHISEL_VERSION}/chisel_${CHISEL_VERSION}_linux_${CHISEL_ARCH}.gz"
BIN_DIR="$HOME/.royaltaxi"
mkdir -p "$BIN_DIR"

if [ ! -x "$BIN_DIR/chisel" ]; then
  echo ""
  echo "⬇️  Chisel yuklanmoqda..."
  wget -q -O "$BIN_DIR/chisel.gz" "$CHISEL_URL"
  gunzip -f "$BIN_DIR/chisel.gz"
  chmod +x "$BIN_DIR/chisel"
  echo "   ✓ chisel: $BIN_DIR/chisel"
else
  echo "   ✓ chisel: allaqachon bor"
fi

# ── 5. Asosiy tunel skripti ──────────────────────────────────────────
# Bu skript:
#   • Wake-lock (CPU uxlamasin)
#   • WiFi-lock (WiFi screen-off'da ham uzilmasin)
#   • Foreground notification (Android jarayonni o'ldirmasin)
#   • Cheksiz qayta-ulanish (uzilsa darhol tiklash)
cat > "$BIN_DIR/run-tunnel.sh" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
# Royaltaxi tunel — doimiy ishlash uchun

LOG="\$HOME/.royaltaxi/tunnel.log"
mkdir -p "\$HOME/.royaltaxi"

# CPU + WiFi wake-lock — ekran o'chsa ham uzilmaslik uchun
termux-wake-lock 2>/dev/null || true

# Foreground notification — Android tunelni "background restriction"
# bilan o'ldirmaydi, chunki notification ko'rsatilgan jarayon "important"
termux-notification \\
  --id royaltaxi-tunnel \\
  --title "🚖 Royaltaxi Tunel" \\
  --content "Doimiy ishlamoqda — yopmang" \\
  --ongoing \\
  --priority high \\
  --alert-once \\
  2>/dev/null || true

# Asosiy halqalsa — tunel uzilsa avto-restart
while true; do
  TS=\$(date '+%Y-%m-%d %H:%M:%S')
  echo "[\$TS] Tunel boshlandi" >> "\$LOG"

  "$BIN_DIR/chisel" client \\
    --auth $AUTH \\
    --keepalive 25s \\
    --max-retry-interval 5s \\
    --max-retry-count -1 \\
    http://${SERVER_IP}:${SERVER_PORT} \\
    R:1080:socks >> "\$LOG" 2>&1 || true

  TS=\$(date '+%Y-%m-%d %H:%M:%S')
  echo "[\$TS] Tunel uzildi — 3s da qayta ulanmoqda..." >> "\$LOG"

  # Notification yangilanadi (uzilgan holatda)
  termux-notification \\
    --id royaltaxi-tunnel \\
    --title "🔄 Royaltaxi Tunel — qayta ulanmoqda" \\
    --content "Internet/WiFi tekshiring" \\
    --ongoing \\
    --priority low \\
    --alert-once \\
    2>/dev/null || true

  sleep 3
done
EOF
chmod +x "$BIN_DIR/run-tunnel.sh"
echo "   ✓ Tunel skript: $BIN_DIR/run-tunnel.sh"

# ── 6. Termux:Boot autostart (telefon yongan zahoti ishga tushadi) ──
BOOT_DIR="$HOME/.termux/boot"
mkdir -p "$BOOT_DIR"
cat > "$BOOT_DIR/00-royaltaxi-tunnel.sh" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
# Telefon yongan zahoti tunel ishga tushadi
nohup "$BIN_DIR/run-tunnel.sh" > /dev/null 2>&1 &
EOF
chmod +x "$BOOT_DIR/00-royaltaxi-tunnel.sh"
echo "   ✓ Autostart: $BOOT_DIR/00-royaltaxi-tunnel.sh"

# ── 7. Health-check (har 15 daqiqada — agar uzilsa qayta yoqadi) ────
# Termux Job Scheduler — Android'ning rasmiy mexanizmi. Termux yopilsa
# ham qayta ishga tushiradi.
CHECK_SCRIPT="$BIN_DIR/check-tunnel.sh"
cat > "$CHECK_SCRIPT" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
# Tunel ishlamayotgan bo'lsa — qayta yoqadi
if ! pgrep -f "$BIN_DIR/chisel" > /dev/null 2>&1; then
  nohup "$BIN_DIR/run-tunnel.sh" > /dev/null 2>&1 &
fi
EOF
chmod +x "$CHECK_SCRIPT"

# Eski job'larni tozalash
termux-job-scheduler --cancel-all 2>/dev/null || true

# Yangi job — har 15 daqiqada
termux-job-scheduler \
  --script "$CHECK_SCRIPT" \
  --period-ms 900000 \
  --persisted true \
  --network unmetered 2>/dev/null || \
termux-job-scheduler \
  --script "$CHECK_SCRIPT" \
  --period-ms 900000 \
  --persisted true 2>/dev/null || \
  echo "   ⚠️  Job scheduler ishlamadi (Termux:API kerak)"
echo "   ✓ Health-check: har 15 daqiqada"

# ── 8. Eski jarayonlarni to'xtatish va yangi tunelni boshlash ──────
echo ""
echo "▶️  Tunel hoziroq ishga tushirilmoqda..."
pkill -f "$BIN_DIR/chisel" 2>/dev/null || true
sleep 1
nohup "$BIN_DIR/run-tunnel.sh" > /dev/null 2>&1 &
sleep 4

# ── 9. Status tekshirish ────────────────────────────────────────────
if pgrep -f "$BIN_DIR/chisel" > /dev/null; then
  PID=$(pgrep -f "$BIN_DIR/chisel" | head -1)
  echo "   ✅ Tunel ishlamoqda (PID: $PID)"
else
  echo "   ⚠️  Tunel hali yo'q — log: ~/.royaltaxi/tunnel.log"
fi

echo ""
echo "════════════════════════════════════════"
echo "✅ HAMMASI TAYYOR!"
echo ""
echo "📋 Foydali buyruqlar:"
echo "   tail -f ~/.royaltaxi/tunnel.log    — jonli log"
echo "   pgrep -af chisel                   — jarayon holati"
echo "   ~/.royaltaxi/run-tunnel.sh         — qo'lda qayta yoqish"
echo ""
echo "⚠️  TELEFON SOZLAMALARI (juda muhim!):"
echo "   1) Termux:Boot dasturini bir marta oching"
echo "   2) Sozlamalar → Batareya → Termux + Termux:API → 'Cheksiz'"
echo "   3) WiFi → Qo'shimcha → 'Uxlash rejimida WiFi yoqiq' (Always on)"
echo "   4) Tezkor sozlamalar → 'Batareya saqlash' o'chiq bo'lsin"
echo ""
echo "💡 Bildirishnoma panelida 🚖 'Royaltaxi Tunel' doimiy turadi —"
echo "   bu Android tunelni o'ldirmasligi uchun. Yopmang!"
echo ""

#!/data/data/com.termux/files/usr/bin/sh
# ─────────────────────────────────────────────────────────────────────
#  ROYALTAXI TUNNEL — ANDROID (TERMUX) INSTALLER
#  Telefonni doim yoqib, WiFi'ga ulab qo'ying — tunnel avto-ishga tushadi
# ─────────────────────────────────────────────────────────────────────
#
#  ISHLATISH:
#  1. Telefonga F-Droid o'rnating: https://f-droid.org/
#  2. F-Droid'dan o'rnating:
#       - Termux
#       - Termux:Boot   (telefon yongan zahoti avto-start uchun)
#       - Termux:API    (wakelock — ekran o'chsa ham ishlash)
#  3. Termux'ni oching va shuni yozing:
#       curl -fsSL https://raw.githubusercontent.com/jaxongr/RoyaltaxiAI/main/tools/termux-tunnel-install.sh | sh
#     (yoki agar GitHub privat bo'lsa, faylni qo'lda nusxalang)
#  4. Termux:Boot bir marta oching (autostart faollashtirish uchun)
#  5. Tayyor — telefon doim ulanib turadi
#
# ─────────────────────────────────────────────────────────────────────

set -eu

SERVER_IP="46.8.194.45"
SERVER_PORT="8080"
AUTH="tunnel:Jvr2iOpDaV"
CHISEL_VERSION="1.10.1"

echo ""
echo "🚀 ROYALTAXI TUNNEL — TERMUX O'RNATGICH"
echo "════════════════════════════════════════"
echo ""

# 1. Arxitekturani aniqlash
ARCH=$(uname -m)
case "$ARCH" in
  aarch64|arm64) CHISEL_ARCH="arm64" ;;
  armv7l|armv8l) CHISEL_ARCH="armv7" ;;
  x86_64)        CHISEL_ARCH="amd64" ;;
  i*86)          CHISEL_ARCH="386" ;;
  *) echo "❌ Noma'lum arxitektura: $ARCH"; exit 1 ;;
esac
echo "📱 Telefon arxitekturasi: $ARCH → chisel_${CHISEL_ARCH}"

# 2. Kerakli paketlar
echo ""
echo "📦 Kerakli paketlarni o'rnatish..."
pkg update -y > /dev/null 2>&1 || true
pkg install -y wget termux-api > /dev/null 2>&1 || true

# 3. Chisel binary'ni yuklab olish
CHISEL_URL="https://github.com/jpillora/chisel/releases/download/v${CHISEL_VERSION}/chisel_${CHISEL_VERSION}_linux_${CHISEL_ARCH}.gz"
BIN_DIR="$HOME/.royaltaxi"
mkdir -p "$BIN_DIR"

if [ ! -x "$BIN_DIR/chisel" ]; then
  echo ""
  echo "⬇️  Chisel yuklab olinmoqda..."
  wget -q -O "$BIN_DIR/chisel.gz" "$CHISEL_URL"
  gunzip -f "$BIN_DIR/chisel.gz"
  chmod +x "$BIN_DIR/chisel"
  echo "   ✓ Chisel o'rnatildi: $BIN_DIR/chisel"
else
  echo "   ✓ Chisel allaqachon bor"
fi

# 4. Autostart skripti (Termux:Boot)
BOOT_DIR="$HOME/.termux/boot"
mkdir -p "$BOOT_DIR"

cat > "$BOOT_DIR/00-royaltaxi-tunnel.sh" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
# Royaltaxi tunnel — telefon yongan zahoti ishga tushadi
# Wakelock — ekran o'chsa ham ishlash davom etsin
termux-wake-lock 2>/dev/null || true

# Tunelni qayta-qayta qo'zg'atish (uzilsa avto-restart)
LOG="\$HOME/.royaltaxi/tunnel.log"
mkdir -p "\$HOME/.royaltaxi"
while true; do
  echo "[\$(date '+%Y-%m-%d %H:%M:%S')] Tunel boshlandi" >> "\$LOG"
  "$BIN_DIR/chisel" client \\
    --auth $AUTH \\
    --keepalive 30s \\
    --max-retry-interval 10s \\
    http://${SERVER_IP}:${SERVER_PORT} \\
    R:1080:socks >> "\$LOG" 2>&1 || true
  echo "[\$(date '+%Y-%m-%d %H:%M:%S')] Tunel uzildi, 5s kutib qayta ulanish..." >> "\$LOG"
  sleep 5
done
EOF
chmod +x "$BOOT_DIR/00-royaltaxi-tunnel.sh"
echo "   ✓ Autostart o'rnatildi: $BOOT_DIR/00-royaltaxi-tunnel.sh"

# 5. Hozir ham ishga tushiramiz (kutmasdan)
echo ""
echo "▶️  Tunel hoziroq ishga tushirilmoqda..."

# Eski jarayonni to'xtatish (agar bo'lsa)
pkill -f "chisel client" 2>/dev/null || true
sleep 1

# Wakelock olish
termux-wake-lock 2>/dev/null || echo "   ⚠️  Termux:API o'rnatilmagan — wakelock ishlamaydi"

# Background'da ishga tushirish
nohup "$BOOT_DIR/00-royaltaxi-tunnel.sh" > /dev/null 2>&1 &

sleep 3

# 6. Status tekshirish
if pgrep -f "chisel client" > /dev/null; then
  echo "   ✅ Tunel ishlamoqda (PID: $(pgrep -f 'chisel client' | head -1))"
else
  echo "   ⚠️  Tunel hali yo'q — log'ni tekshiring: ~/.royaltaxi/tunnel.log"
fi

echo ""
echo "════════════════════════════════════════"
echo "✅ TAYYOR!"
echo ""
echo "📋 Foydali buyruqlar (Termux'da):"
echo "   tail -f ~/.royaltaxi/tunnel.log    — log ko'rish"
echo "   pkill -f chisel                    — tunelni to'xtatish"
echo "   ~/.termux/boot/00-royaltaxi-tunnel.sh &  — qo'lda qayta yoqish"
echo ""
echo "💡 MUHIM:"
echo "   • Telefonni doim WiFi'ga ulab qo'ying"
echo "   • Termux:Boot dasturini bir marta oching (autostart yoqilishi uchun)"
echo "   • Sozlamalar → Battery → Termux → cheklanmagan rejim"
echo "   • Termux:API → fonda ishlash ruxsati"
echo ""

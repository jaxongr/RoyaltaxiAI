#!/bin/bash
# Royaltaxi AI — yangi VPS'ga to'liq deploy.
# Foydalanish:
#   curl -fsSL https://raw.githubusercontent.com/jaxongr/RoyaltaxiAI/main/deploy.sh | bash
# Yoki manual:
#   bash deploy.sh
set -e

echo "========================================"
echo "  ROYALTAXI AI — VPS DEPLOY"
echo "========================================"

# 1. Node.js 20
if ! command -v node &> /dev/null || ! node --version | grep -q "^v20\|^v21\|^v22"; then
    echo "▶ Node.js 20 o'rnatish..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
echo "✓ Node: $(node --version)"

# 2. Build tools
echo "▶ Build tools o'rnatish..."
apt-get update -qq
apt-get install -y -qq python3 build-essential git nginx ufw

# 3. PM2
if ! command -v pm2 &> /dev/null; then
    echo "▶ PM2 o'rnatish..."
    npm install -g pm2
fi
echo "✓ PM2: $(pm2 --version)"

# 4. Playwright (Chromium tanlovga muvofiq)
echo "▶ Chromium uchun OS paketlarni o'rnatish..."
apt-get install -y -qq libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libpango-1.0-0 libcairo2 libasound2t64 libxss1 2>/dev/null || \
    apt-get install -y -qq libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libpango-1.0-0 libcairo2 libasound2 libxss1

# 5. Clone yoki update
cd /opt
if [ ! -d /opt/royaltaxi ]; then
    echo "▶ Repo clone..."
    git clone https://github.com/jaxongr/RoyaltaxiAI.git royaltaxi
fi
cd /opt/royaltaxi
echo "▶ Git pull..."
git pull

# 6. npm install
echo "▶ npm install (backend)..."
npm install --omit=dev

echo "▶ npm install (admin)..."
cd admin
npm install
echo "▶ Admin build..."
npm run build
cd ..

# 7. Playwright Chromium
echo "▶ Playwright Chromium o'rnatish..."
npx playwright install --with-deps chromium 2>&1 | tail -3

# 8. .env yaratish (agar yo'q bo'lsa)
if [ ! -f /opt/royaltaxi/.env ]; then
    echo "▶ .env yaratish..."
    cat > /opt/royaltaxi/.env <<'EOF'
ROYALTAXI_USERNAME=jaxong1r
ROYALTAXI_PASSWORD="Bc5sd%G#fd@df"
ROYALTAXI_BASE_URL=https://hive-respublika-new.royaltaxi.uz
GEMINI_API_KEY=
TELEGRAM_BOT_TOKEN="8476944941:AAEs2DcTDIisDIKmJ8cEom8TuVoLjYL-H4k"
TELEGRAM_CHAT_ID=5475915736
LOG_LEVEL=info
BROWSER_HEADLESS=true
NODE_ENV=production
DASHBOARD_PORT=4000
EOF
    chmod 600 /opt/royaltaxi/.env
fi

# 9. PM2 jarayonlarini ishga tushirish
echo "▶ PM2 dashboard..."
pm2 delete royaltaxi-dashboard 2>/dev/null || true
pm2 start --name royaltaxi-dashboard --time -- npx tsx /opt/royaltaxi/src/dashboard.ts

# Auto-start
pm2 save
pm2 startup systemd -u root --hp /root 2>&1 | tail -3 || true

# 10. Nginx proxy
echo "▶ Nginx sozlash..."
cat > /etc/nginx/sites-available/royaltaxi <<'NGINX'
server {
    listen 80;
    server_name _;
    client_max_body_size 200M;
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/royaltaxi /etc/nginx/sites-enabled/royaltaxi
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx && systemctl enable nginx

# 11. Firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 12. Yakuniy holat
sleep 3
IP=$(curl -s --max-time 5 ifconfig.me)
echo ""
echo "========================================"
echo "  ✅ DEPLOY MUVAFFAQIYATLI!"
echo "========================================"
echo ""
echo "Dashboard: http://$IP"
echo ""
echo "Test:"
curl -s -o /dev/null -w "  API: HTTP %{http_code}\n" http://localhost:4000/api/overview
echo ""
echo "Keyingi qadam:"
echo "  1. Brauzer: http://$IP"
echo "  2. Sozlamalar → 🚀 MONITORNI ISHGA TUSHIR"
echo "  3. Chromium fonda ishlaydi, ma'lumotlar to'planadi"
echo ""
echo "PM2 buyruqlari:"
echo "  pm2 status"
echo "  pm2 logs royaltaxi-dashboard"
echo "  pm2 restart royaltaxi-dashboard"

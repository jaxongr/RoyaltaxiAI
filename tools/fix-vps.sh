#!/bin/bash
set -e
echo "=== Fix Ubuntu apt + Node 20 ==="

# Eski cdrom repo o'chirish
sed -i '/^deb cdrom/d' /etc/apt/sources.list
sed -i '/^deb file/d' /etc/apt/sources.list

# Node 12 ni olib tashlash
apt-get remove -y --purge nodejs libnode72 nodejs-doc 2>/dev/null || true
apt-get autoremove -y 2>/dev/null || true

# Node 20 to'g'ri o'rnatish
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "✓ Node: $(node --version)"
echo "✓ npm: $(npm --version)"

# PM2
npm install -g pm2 2>&1 | tail -2
echo "✓ PM2: $(pm2 --version)"

# Build tools
apt-get install -y python3 build-essential git nginx ufw

# Repo
cd /opt
[ ! -d royaltaxi ] && git clone https://github.com/jaxongr/RoyaltaxiAI.git royaltaxi
cd royaltaxi
git pull

# Install
npm install --omit=dev 2>&1 | tail -3
cd admin && npm install 2>&1 | tail -2 && npm run build 2>&1 | tail -2 && cd ..

# Playwright Chromium
npx playwright install --with-deps chromium 2>&1 | tail -3

# .env
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
PROXY_URL=socks5://127.0.0.1:1080
EOF
chmod 600 /opt/royaltaxi/.env

# PM2 dashboard
pm2 delete royaltaxi-dashboard 2>/dev/null || true
cd /opt/royaltaxi
pm2 start --name royaltaxi-dashboard --time -- npx tsx src/dashboard.ts
pm2 save
pm2 startup systemd -u root --hp /root 2>&1 | tail -3 || true

# Nginx
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

# Firewall
ufw allow 22/tcp 2>&1 | tail -1
ufw allow 80/tcp 2>&1 | tail -1
ufw allow 443/tcp 2>&1 | tail -1
ufw allow 8080/tcp 2>&1 | tail -1
ufw --force enable 2>&1 | tail -1

sleep 3
echo ""
echo "=== TEST ==="
curl -s -o /dev/null -w "Dashboard: HTTP %{http_code}\n" http://localhost:4000/api/overview
echo "=== Tunnel test ==="
curl -s -o /dev/null -w "Sayt via tunnel: HTTP %{http_code} (%{time_total}s)\n" --max-time 15 --socks5 127.0.0.1:1080 https://hive-respublika-new.royaltaxi.uz/management
echo ""
echo "✅ DEPLOY MUVAFFAQIYATLI: http://46.8.194.45"

/**
 * Web dashboard — saxifali, hududlar bo'yicha, statistika va filtrlar.
 * Foydalanish:
 *   npm run dashboard
 * Brauzer: http://localhost:4000
 */
import { createServer } from 'node:http';
import { parse as parseUrl } from 'node:url';
import { resolve, extname } from 'node:path';
import { existsSync, readFileSync, appendFileSync, writeFileSync, statSync, readFile } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { openDb, DB_PATH } from './db.js';
import { logger } from './common/logger.js';
import { config } from './common/config.js';
import { FRAUD_THRESHOLDS } from './fraud/rules.js';

const PORT = parseInt(process.env.DASHBOARD_PORT ?? '4000', 10);
const db = openDb();

const HTML = String.raw`<!doctype html>
<html lang="uz">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Royaltaxi AI — Firibgarlik Boshqaruv</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f1115; color: #e8e9eb; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; line-height: 1.4; }

  /* Top nav */
  .nav { background: #161922; border-bottom: 1px solid #2a2f3a; padding: 12px 20px; position: sticky; top: 0; z-index: 10; }
  .nav-row { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  .brand { font-weight: 700; font-size: 18px; display: flex; align-items: center; gap: 10px; margin-right: 20px; }
  .pulse { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 10px #22c55e; animation: pulse 2s infinite; }
  .pulse.warn { background: #f59e0b; box-shadow: 0 0 10px #f59e0b; }
  .pulse.dead { background: #ef4444; box-shadow: 0 0 10px #ef4444; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
  .tabs { display: flex; gap: 4px; flex-wrap: wrap; }
  .tab { padding: 8px 14px; border-radius: 6px; cursor: pointer; color: #9aa0aa; font-size: 14px; transition: 0.15s; user-select: none; }
  .tab:hover { background: #1f2229; color: #e8e9eb; }
  .tab.active { background: #6b46c1; color: white; }
  .nav-status { margin-left: auto; font-size: 12px; color: #9aa0aa; }

  .container { padding: 20px; max-width: 1600px; margin: 0 auto; }

  /* Cards */
  .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-bottom: 20px; }
  .card { background: #1a1d24; border: 1px solid #2a2f3a; border-radius: 10px; padding: 14px; }
  .card .label { font-size: 11px; color: #9aa0aa; text-transform: uppercase; letter-spacing: 0.5px; }
  .card .value { font-size: 26px; font-weight: 700; margin-top: 4px; }
  .card.danger .value { color: #ef4444; }
  .card.warn .value { color: #f59e0b; }
  .card.ok .value { color: #22c55e; }
  .card.info .value { color: #60a5fa; }

  /* Panels */
  .panel { background: #1a1d24; border: 1px solid #2a2f3a; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  .panel h2 { font-size: 14px; color: #9aa0aa; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; display: flex; justify-content: space-between; align-items: center; }
  .panel h2 .right { font-size: 13px; color: #6b7280; text-transform: none; letter-spacing: 0; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: #9aa0aa; padding: 8px 8px; border-bottom: 1px solid #2a2f3a; font-weight: 500; position: sticky; top: 0; background: #1a1d24; cursor: pointer; }
  th:hover { color: #e8e9eb; }
  td { padding: 9px 8px; border-bottom: 1px solid #1f2229; }
  tr:hover td { background: #1f2229; cursor: pointer; }
  tr.clickable td:first-child { color: #60a5fa; }
  .table-wrap { max-height: 600px; overflow: auto; }

  /* Pills */
  .pill { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; white-space: nowrap; }
  .pill.danger { background: rgba(239,68,68,0.2); color: #ef4444; }
  .pill.warn { background: rgba(245,158,11,0.2); color: #f59e0b; }
  .pill.info { background: rgba(96,165,250,0.2); color: #60a5fa; }
  .pill.ok { background: rgba(34,197,94,0.2); color: #22c55e; }
  .pill.muted { background: #1f2229; color: #9aa0aa; }

  .muted { color: #9aa0aa; }
  code { background: #0f1115; padding: 2px 6px; border-radius: 4px; font-size: 12px; font-family: monospace; }

  /* Filters */
  .filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
  input[type="text"], input[type="date"], select { background: #0f1115; border: 1px solid #2a2f3a; color: #e8e9eb; padding: 8px 12px; border-radius: 6px; font-size: 13px; outline: none; }
  input:focus, select:focus { border-color: #6b46c1; }
  button { background: #6b46c1; color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; }
  button:hover { background: #7c52d6; }
  button.secondary { background: #2a2f3a; }
  button.secondary:hover { background: #3a3f4a; }

  /* Modal */
  .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: none; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
  .modal.open { display: flex; }
  .modal-content { background: #1a1d24; border-radius: 12px; padding: 24px; max-width: 1100px; width: 100%; max-height: 90vh; overflow: auto; border: 1px solid #2a2f3a; }
  .modal-close { float: right; background: #2a2f3a; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; }

  /* Two-col layout */
  .two-col { display: grid; gap: 16px; grid-template-columns: 1fr 1fr; }
  @media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }

  /* Bar chart */
  .bar-row { display: flex; align-items: center; gap: 12px; padding: 6px 0; }
  .bar-label { width: 140px; font-size: 13px; flex-shrink: 0; }
  .bar-container { flex: 1; background: #1f2229; height: 22px; border-radius: 4px; overflow: hidden; position: relative; }
  .bar-fill { height: 100%; background: linear-gradient(90deg, #6b46c1, #2dd4a8); border-radius: 4px; }
  .bar-value { width: 70px; text-align: right; font-size: 13px; font-weight: 600; }

  .empty { text-align: center; padding: 40px; color: #6b7280; }
</style>
</head>
<body>
<div class="nav">
  <div class="nav-row">
    <div class="brand"><span class="pulse" id="pulse"></span> Royaltaxi AI</div>
    <div class="tabs">
      <div class="tab active" data-page="home">📊 Asosiy</div>
      <div class="tab" data-page="regions">🗺 Hududlar</div>
      <div class="tab" data-page="drivers">🚖 Haydovchilar</div>
      <div class="tab" data-page="alerts">⚠️ Ogohlantirishlar</div>
      <div class="tab" data-page="blocks">⛔ Bloklar</div>
      <div class="tab" data-page="orders">📦 Zakazlar</div>
      <div class="tab" data-page="stats">📈 Statistika</div>
    </div>
    <div class="nav-status" id="navStatus">—</div>
  </div>
</div>

<div class="container" id="container"></div>

<div class="modal" id="modal">
  <div class="modal-content">
    <button class="modal-close" onclick="closeModal()">✕ Yopish</button>
    <div id="modalBody"></div>
  </div>
</div>

<script>
// ===== Helpers =====
function fmtKm(km) { if (km === null || km === undefined) return '—'; return km < 1 ? Math.round(km * 1000) + 'm' : km.toFixed(2) + 'km'; }
function fmtSek(s) { if (s === null || s === undefined) return '—'; if (s < 60) return s + 's'; return Math.floor(s/60) + 'd ' + (s%60) + 's'; }
function fmtNarx(n) { if (!n) return '—'; return n.toLocaleString('ru-RU') + ' so\'m'; }
function fmtTime(ts) { if (!ts) return '—'; const d = new Date(ts.includes('T') ? ts : ts.replace(' ', 'T') + '+05:00'); return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'medium' }); }
function fmtTimeShort(ts) { if (!ts) return '—'; const d = new Date(ts.includes('T') ? ts : ts.replace(' ', 'T') + '+05:00'); return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function scoreClass(s) { return s >= 150 ? 'danger' : s >= 80 ? 'warn' : 'info'; }
function statusClass(s) { return s === 'finish' ? 'ok' : s === 'order_cancelled' ? 'warn' : 'muted'; }
function statusLabel(s) { return s === 'finish' ? 'Bajarildi' : s === 'order_cancelled' ? 'Bekor qilindi' : s; }
function esc(s) { return String(s ?? '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); }

async function api(path) {
  const r = await fetch(path);
  return r.json();
}

// ===== Navigation =====
let currentPage = 'home';
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => { currentPage = t.dataset.page; document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t)); render(); });
});

function openModal(html) { document.getElementById('modalBody').innerHTML = html; document.getElementById('modal').classList.add('open'); }
function closeModal() { document.getElementById('modal').classList.remove('open'); }

// ===== Status (always-visible top right) =====
async function refreshStatus() {
  try {
    const d = await api('/api/overview');
    const cov = d.coveragePct;
    const tickAgo = d.secondsSinceLastTick;
    const pulse = document.getElementById('pulse');
    pulse.className = 'pulse' + (tickAgo > 60 || cov < 95 ? ' warn' : tickAgo > 120 ? ' dead' : '');
    document.getElementById('navStatus').innerHTML =
      'Qamrov: <b>' + (cov === null ? '—' : cov.toFixed(1) + '%') + '</b> • ' +
      'Tick: <b>' + d.tickCount + '</b> • ' +
      'Oxirgi: ' + (tickAgo === null ? '—' : tickAgo + 's oldin') + ' • ' +
      d.ordersToday + ' zakaz / ' + d.alertsToday + ' alert / ' + d.blocksTotal + ' blok';
  } catch(e) {
    document.getElementById('pulse').className = 'pulse dead';
    document.getElementById('navStatus').textContent = 'Server javob bermayapti';
  }
}

// ===== Render =====
async function render() {
  const c = document.getElementById('container');
  c.innerHTML = '<div class="empty">⏳ Yuklanmoqda...</div>';
  try {
    if (currentPage === 'home') return renderHome(c);
    if (currentPage === 'regions') return renderRegions(c);
    if (currentPage === 'drivers') return renderDrivers(c);
    if (currentPage === 'alerts') return renderAlerts(c);
    if (currentPage === 'blocks') return renderBlocks(c);
    if (currentPage === 'orders') return renderOrders(c);
    if (currentPage === 'stats') return renderStats(c);
  } catch(e) {
    c.innerHTML = '<div class="empty">❌ Xato: ' + esc(e.message) + '</div>';
  }
}

// ===== Page: Home =====
async function renderHome(c) {
  const d = await api('/api/overview');
  c.innerHTML = '\
  <div class="grid">\
    <div class="card info"><div class="label">Bugun zakazlar</div><div class="value">' + d.ordersToday + '</div></div>\
    <div class="card warn"><div class="label">Bugun ogohlantirish</div><div class="value">' + d.alertsToday + '</div></div>\
    <div class="card danger"><div class="label">Blok tavsiyalari</div><div class="value">' + d.blocksTotal + '</div></div>\
    <div class="card ok"><div class="label">Oxirgi 1 soatda</div><div class="value">' + d.alertsLastHour + '</div></div>\
    <div class="card ' + (d.coveragePct >= 99 ? 'ok' : d.coveragePct >= 95 ? 'warn' : 'danger') + '"><div class="label">Qamrov</div><div class="value">' + (d.coveragePct === null ? '—' : d.coveragePct.toFixed(1) + '%') + '</div></div>\
    <div class="card info"><div class="label">Tezlik</div><div class="value">' + d.rate + ' /min</div></div>\
  </div>';

  const recent = await api('/api/alerts?limit=20');
  c.innerHTML += '\
  <div class="two-col">\
    <div class="panel">\
      <h2>🚨 Eng so\'nggi ogohlantirishlar</h2>\
      <div class="table-wrap"><table><thead><tr><th>Vaqt</th><th>Haydovchi</th><th>Masofa</th><th>Sabab</th><th>Ball</th></tr></thead><tbody>\
        ' + (recent.items.length ? recent.items.map(a =>
          '<tr onclick="showOrder(' + a.order_id + ')">\
            <td class="muted">' + fmtTimeShort(a.created_at) + '</td>\
            <td><code>' + esc(a.callsign||'—') + '</code><br>' + esc(a.driver_name||'') + '</td>\
            <td>' + fmtKm(a.distance_km) + '</td>\
            <td class="muted" style="font-size:12px">' + esc((a.details||'').slice(0,80)) + '</td>\
            <td><span class="pill ' + scoreClass(a.fraud_score) + '">' + a.fraud_score + '</span></td>\
          </tr>').join('') : '<tr><td colspan="5" class="muted" style="text-align:center;padding:20px">Hozircha alert yo\'q</td></tr>') + '\
      </tbody></table></div>\
    </div>\
    <div class="panel">\
      <h2>⛔ Eng yangi blok tavsiyalari</h2>\
      <div class="table-wrap" id="blocksHome"></div>\
    </div>\
  </div>';

  const blocks = await api('/api/blocks?limit=15');
  document.getElementById('blocksHome').innerHTML =
    '<table><thead><tr><th>Belgi</th><th>Haydovchi</th><th>Alert</th><th>Ball</th><th>Vaqt</th></tr></thead><tbody>' +
    (blocks.items.length ? blocks.items.map(b =>
      '<tr onclick="showDriver(\'' + esc(b.callsign) + '\')">\
        <td><code>' + esc(b.callsign) + '</code></td>\
        <td>' + esc(b.driver_name) + '</td>\
        <td>' + b.alert_count + '</td>\
        <td><span class="pill danger">' + b.total_score + '</span></td>\
        <td class="muted">' + fmtTimeShort(b.blocked_at) + '</td>\
      </tr>').join('') : '<tr><td colspan="5" class="muted" style="text-align:center;padding:20px">Hozircha blok yo\'q</td></tr>') +
    '</tbody></table>';
}

// ===== Page: Regions =====
async function renderRegions(c) {
  const d = await api('/api/regions');
  const max = Math.max(...d.items.map(r => r.orders), 1);
  c.innerHTML = '\
  <div class="panel">\
    <h2>🗺 Hududlar bo\'yicha bugungi holat <span class="right">' + d.items.length + ' ta hudud</span></h2>\
    <div class="table-wrap"><table><thead><tr><th>Hudud</th><th>Zakaz</th><th>Bajarildi</th><th>Bekor</th><th>Bekor %</th><th>Alert</th><th>Bloklar</th><th>Eng ko\'p</th></tr></thead><tbody>\
      ' + d.items.map(r =>
        '<tr onclick="showRegion(\'' + esc(r.region) + '\')">\
          <td><b>' + esc(r.region || '(noma\'lum)') + '</b></td>\
          <td>' + r.orders + '</td>\
          <td><span class="pill ok">' + r.completed + '</span></td>\
          <td><span class="pill warn">' + r.cancelled + '</span></td>\
          <td>' + (r.orders ? Math.round(r.cancelled/r.orders*1000)/10 : 0) + '%</td>\
          <td>' + (r.alerts ? '<span class="pill warn">' + r.alerts + '</span>' : '0') + '</td>\
          <td>' + (r.blocks ? '<span class="pill danger">' + r.blocks + '</span>' : '0') + '</td>\
          <td class="muted">' + esc(r.topDriver || '—') + '</td>\
        </tr>').join('') + '\
    </tbody></table></div>\
  </div>\
  <div class="panel">\
    <h2>📊 Zakazlar taqsimoti</h2>\
    ' + d.items.map(r =>
      '<div class="bar-row"><div class="bar-label">' + esc(r.region) + '</div><div class="bar-container"><div class="bar-fill" style="width:' + (r.orders/max*100) + '%"></div></div><div class="bar-value">' + r.orders + '</div></div>'
    ).join('') + '\
  </div>';
}

// ===== Page: Drivers =====
async function renderDrivers(c) {
  c.innerHTML = '\
  <div class="panel">\
    <h2>🚖 Haydovchilar — qidiruv va filtr</h2>\
    <div class="filters">\
      <input type="text" id="drvSearch" placeholder="Ism yoki belgi (QSH1234)" style="flex:1;min-width:240px">\
      <select id="drvSort">\
        <option value="alerts">Eng ko\'p alert</option>\
        <option value="score">Eng yuqori ball</option>\
        <option value="orders">Eng ko\'p zakaz</option>\
        <option value="cancel">Eng ko\'p bekor</option>\
      </select>\
      <button onclick="loadDrivers()">Qidirish</button>\
    </div>\
    <div id="drvList"></div>\
  </div>';
  document.getElementById('drvSearch').addEventListener('input', debounce(loadDrivers, 300));
  document.getElementById('drvSort').addEventListener('change', loadDrivers);
  await loadDrivers();
}
async function loadDrivers() {
  const q = document.getElementById('drvSearch').value;
  const sort = document.getElementById('drvSort').value;
  const d = await api('/api/drivers?q=' + encodeURIComponent(q) + '&sort=' + sort);
  document.getElementById('drvList').innerHTML =
    '<div class="table-wrap"><table><thead><tr><th>Belgi</th><th>Haydovchi</th><th>Zakaz</th><th>Bajarildi</th><th>Bekor</th><th>Alert</th><th>Ball</th><th>Blokmi?</th></tr></thead><tbody>' +
    (d.items.length ? d.items.map(r =>
      '<tr onclick="showDriver(\'' + esc(r.callsign) + '\')">\
        <td><code>' + esc(r.callsign) + '</code></td>\
        <td>' + esc(r.driver_name||'—') + '</td>\
        <td>' + r.orders + '</td>\
        <td><span class="pill ok">' + r.completed + '</span></td>\
        <td><span class="pill warn">' + r.cancelled + '</span></td>\
        <td>' + (r.alerts ? '<span class="pill warn">' + r.alerts + '</span>' : '0') + '</td>\
        <td>' + (r.total_score ? '<span class="pill ' + (r.total_score >= 200 ? 'danger' : 'warn') + '">' + r.total_score + '</span>' : '0') + '</td>\
        <td>' + (r.is_blocked ? '<span class="pill danger">BLOK</span>' : '—') + '</td>\
      </tr>').join('') : '<tr><td colspan="8" class="muted" style="text-align:center;padding:20px">Topilmadi</td></tr>') +
    '</tbody></table></div>';
}

// ===== Page: Alerts =====
async function renderAlerts(c) {
  c.innerHTML = '\
  <div class="panel">\
    <h2>⚠️ Barcha ogohlantirishlar</h2>\
    <div class="filters">\
      <select id="alDays">\
        <option value="1">Bugun</option>\
        <option value="7" selected>Oxirgi 7 kun</option>\
        <option value="30">30 kun</option>\
        <option value="999">Hammasi</option>\
      </select>\
      <select id="alRegion"><option value="">Barcha hududlar</option></select>\
      <select id="alMinScore"><option value="50">Ball ≥50</option><option value="100">Ball ≥100</option><option value="150">Ball ≥150</option></select>\
      <button onclick="loadAlerts()">Yangilash</button>\
    </div>\
    <div id="alList"></div>\
  </div>';
  const r = await api('/api/regions');
  const sel = document.getElementById('alRegion');
  r.items.forEach(x => { const o = document.createElement('option'); o.value = x.region; o.textContent = x.region; sel.appendChild(o); });
  ['alDays','alRegion','alMinScore'].forEach(id => document.getElementById(id).addEventListener('change', loadAlerts));
  await loadAlerts();
}
async function loadAlerts() {
  const days = document.getElementById('alDays').value;
  const region = document.getElementById('alRegion').value;
  const min = document.getElementById('alMinScore').value;
  const d = await api('/api/alerts?days=' + days + '&region=' + encodeURIComponent(region) + '&minScore=' + min + '&limit=300');
  document.getElementById('alList').innerHTML =
    '<div class="muted" style="margin-bottom:8px">Jami: <b>' + d.items.length + '</b></div>' +
    '<div class="table-wrap"><table><thead><tr><th>Vaqt</th><th>Haydovchi</th><th>Hudud</th><th>Masofa</th><th>Vaqt</th><th>Narx</th><th>Sabab</th><th>Ball</th></tr></thead><tbody>' +
    d.items.map(a =>
      '<tr onclick="showOrder(' + a.order_id + ')">\
        <td class="muted">' + fmtTimeShort(a.created_at) + '</td>\
        <td><code>' + esc(a.callsign||'—') + '</code><br>' + esc(a.driver_name||'') + '</td>\
        <td>' + esc(a.region||'—') + '</td>\
        <td>' + fmtKm(a.distance_km) + '</td>\
        <td>' + fmtSek(a.duration_sec) + '</td>\
        <td>' + fmtNarx(a.amount) + '</td>\
        <td class="muted" style="font-size:12px">' + esc((a.details||'').slice(0,100)) + '</td>\
        <td><span class="pill ' + scoreClass(a.fraud_score) + '">' + a.fraud_score + '</span></td>\
      </tr>').join('') +
    '</tbody></table></div>';
}

// ===== Page: Blocks =====
async function renderBlocks(c) {
  const d = await api('/api/blocks?limit=200');
  c.innerHTML = '\
  <div class="panel">\
    <h2>⛔ Blok tavsiya qilingan haydovchilar <span class="right">' + d.items.length + ' ta</span></h2>\
    <div class="table-wrap"><table><thead><tr><th>Belgi</th><th>Haydovchi</th><th>Alert</th><th>Ball</th><th>Sabab</th><th>Vaqt</th></tr></thead><tbody>\
      ' + (d.items.length ? d.items.map(r =>
        '<tr onclick="showDriver(\'' + esc(r.callsign) + '\')">\
          <td><code>' + esc(r.callsign) + '</code></td>\
          <td>' + esc(r.driver_name) + '</td>\
          <td>' + r.alert_count + '</td>\
          <td><span class="pill danger">' + r.total_score + '</span></td>\
          <td class="muted" style="font-size:12px">' + esc(r.reason) + '</td>\
          <td class="muted">' + fmtTime(r.blocked_at) + '</td>\
        </tr>').join('') : '<tr><td colspan="6" class="empty">Blok tavsiyasi yo\'q</td></tr>') + '\
    </tbody></table></div>\
  </div>';
}

// ===== Page: Orders =====
async function renderOrders(c) {
  c.innerHTML = '\
  <div class="panel">\
    <h2>📦 Zakazlar arxivi</h2>\
    <div class="filters">\
      <input type="date" id="ordDate" value="' + new Date().toISOString().slice(0,10) + '">\
      <select id="ordRegion"><option value="">Barcha hududlar</option></select>\
      <select id="ordStatus"><option value="">Barcha statuslar</option><option value="finish">Bajarildi</option><option value="order_cancelled">Bekor</option></select>\
      <input type="text" id="ordDriver" placeholder="Haydovchi belgisi yoki ismi">\
      <button onclick="loadOrders()">Filtrlash</button>\
    </div>\
    <div id="ordList"></div>\
  </div>';
  const r = await api('/api/regions');
  const sel = document.getElementById('ordRegion');
  r.items.forEach(x => { const o = document.createElement('option'); o.value = x.region; o.textContent = x.region; sel.appendChild(o); });
  await loadOrders();
}
async function loadOrders() {
  const date = document.getElementById('ordDate').value;
  const region = document.getElementById('ordRegion').value;
  const status = document.getElementById('ordStatus').value;
  const driver = document.getElementById('ordDriver').value;
  const d = await api('/api/orders?date=' + date + '&region=' + encodeURIComponent(region) + '&status=' + status + '&driver=' + encodeURIComponent(driver) + '&limit=500');
  document.getElementById('ordList').innerHTML =
    '<div class="muted" style="margin-bottom:8px">Jami: <b>' + d.total + '</b> ' + (d.items.length < d.total ? '(birinchi ' + d.items.length + ')' : '') + '</div>' +
    '<div class="table-wrap"><table><thead><tr><th>Vaqt</th><th>Belgi</th><th>Haydovchi</th><th>Hudud</th><th>Masofa</th><th>Narx</th><th>Status</th><th>Ball</th></tr></thead><tbody>' +
    d.items.map(o =>
      '<tr onclick="showOrder(' + o.order_id + ')">\
        <td class="muted">' + esc(o.time||'') + '</td>\
        <td><code>' + esc(o.callsign||'—') + '</code></td>\
        <td>' + esc(o.driver_name||'—') + '</td>\
        <td>' + esc(o.region||'—') + '</td>\
        <td>' + fmtKm(o.distance_km) + '</td>\
        <td>' + fmtNarx(o.amount) + '</td>\
        <td><span class="pill ' + statusClass(o.status) + '">' + statusLabel(o.status) + '</span></td>\
        <td>' + (o.fraud_score ? '<span class="pill ' + scoreClass(o.fraud_score) + '">' + o.fraud_score + '</span>' : '—') + '</td>\
      </tr>').join('') +
    '</tbody></table></div>';
}

// ===== Page: Stats =====
async function renderStats(c) {
  const d = await api('/api/stats');
  c.innerHTML = '\
  <div class="two-col">\
    <div class="panel">\
      <h2>📊 Soatlik faollik (bugun)</h2>\
      ' + (() => { const max = Math.max(...d.hourly.map(h => h.c), 1); return d.hourly.map(h =>
        '<div class="bar-row"><div class="bar-label">' + h.hour + ':00</div><div class="bar-container"><div class="bar-fill" style="width:' + (h.c/max*100) + '%"></div></div><div class="bar-value">' + h.c + '</div></div>'
      ).join(''); })() + '\
    </div>\
    <div class="panel">\
      <h2>📅 Oxirgi 7 kun</h2>\
      ' + (() => { const max = Math.max(...d.daily.map(h => h.c), 1); return d.daily.map(h =>
        '<div class="bar-row"><div class="bar-label">' + h.date + '</div><div class="bar-container"><div class="bar-fill" style="width:' + (h.c/max*100) + '%"></div></div><div class="bar-value">' + h.c + '</div></div>'
      ).join(''); })() + '\
    </div>\
  </div>\
  <div class="two-col">\
    <div class="panel">\
      <h2>🎯 Firibgarlik turlari (oxirgi 7 kun)</h2>\
      ' + (() => { const max = Math.max(...d.fraudTypes.map(h => h.c), 1); return d.fraudTypes.map(h =>
        '<div class="bar-row"><div class="bar-label" style="width:200px">' + h.label + '</div><div class="bar-container"><div class="bar-fill" style="width:' + (h.c/max*100) + '%"></div></div><div class="bar-value">' + h.c + '</div></div>'
      ).join(''); })() + '\
    </div>\
    <div class="panel">\
      <h2>🚖 Eng yomon 10 haydovchi (7 kun)</h2>\
      <table><thead><tr><th>Belgi</th><th>Ism</th><th>Alert</th><th>Ball</th></tr></thead><tbody>\
        ' + d.topBadDrivers.map(r =>
          '<tr onclick="showDriver(\'' + esc(r.callsign) + '\')"><td><code>' + esc(r.callsign) + '</code></td><td>' + esc(r.driver_name) + '</td><td>' + r.cnt + '</td><td><span class="pill ' + (r.total >= 300 ? 'danger' : 'warn') + '">' + r.total + '</span></td></tr>'
        ).join('') + '\
      </tbody></table>\
    </div>\
  </div>';
}

// ===== Modal: Driver Profile =====
async function showDriver(callsign) {
  openModal('<div class="empty">⏳ Yuklanmoqda...</div>');
  const d = await api('/api/driver?callsign=' + encodeURIComponent(callsign));
  document.getElementById('modalBody').innerHTML = '\
  <h2 style="margin-bottom:16px">' + esc(d.driver_name || callsign) + ' <code>' + esc(callsign) + '</code></h2>\
  <div class="grid">\
    <div class="card info"><div class="label">Jami zakaz</div><div class="value">' + d.stats.total + '</div></div>\
    <div class="card ok"><div class="label">Bajarildi</div><div class="value">' + d.stats.completed + '</div></div>\
    <div class="card warn"><div class="label">Bekor qilindi</div><div class="value">' + d.stats.cancelled + '</div></div>\
    <div class="card warn"><div class="label">Ogohlantirish</div><div class="value">' + d.stats.alerts + '</div></div>\
    <div class="card danger"><div class="label">Jami ball</div><div class="value">' + d.stats.totalScore + '</div></div>\
    <div class="card ' + (d.stats.is_blocked ? 'danger' : 'ok') + '"><div class="label">Holat</div><div class="value">' + (d.stats.is_blocked ? 'BLOK' : 'Normal') + '</div></div>\
  </div>\
  <div class="panel">\
    <h2>📦 Oxirgi 30 zakazi</h2>\
    <table><thead><tr><th>Sana</th><th>Vaqt</th><th>Hudud</th><th>Masofa</th><th>Vaqt</th><th>Narx</th><th>Status</th><th>Ball</th></tr></thead><tbody>\
      ' + d.orders.map(o =>
        '<tr><td>' + esc(o.date) + '</td><td>' + esc(o.time) + '</td><td>' + esc(o.region||'—') + '</td><td>' + fmtKm(o.distance_km) + '</td><td>' + fmtSek(o.duration_sec) + '</td><td>' + fmtNarx(o.amount) + '</td><td><span class="pill ' + statusClass(o.status) + '">' + statusLabel(o.status) + '</span></td><td>' + (o.fraud_score ? '<span class="pill ' + scoreClass(o.fraud_score) + '">' + o.fraud_score + '</span>' : '—') + '</td></tr>'
      ).join('') + '\
    </tbody></table>\
  </div>';
}

// ===== Modal: Region Detail =====
async function showRegion(region) {
  openModal('<div class="empty">⏳ Yuklanmoqda...</div>');
  const d = await api('/api/region?name=' + encodeURIComponent(region));
  document.getElementById('modalBody').innerHTML = '\
  <h2 style="margin-bottom:16px">🗺 ' + esc(region) + '</h2>\
  <div class="grid">\
    <div class="card info"><div class="label">Bugun zakaz</div><div class="value">' + d.stats.today + '</div></div>\
    <div class="card ok"><div class="label">Bajarildi</div><div class="value">' + d.stats.completed + '</div></div>\
    <div class="card warn"><div class="label">Bekor</div><div class="value">' + d.stats.cancelled + '</div></div>\
    <div class="card warn"><div class="label">Alert</div><div class="value">' + d.stats.alerts + '</div></div>\
  </div>\
  <div class="panel"><h2>🚖 Eng faol haydovchilar (bugun)</h2>\
    <table><thead><tr><th>Belgi</th><th>Haydovchi</th><th>Zakaz</th><th>Bajarildi</th><th>Bekor</th><th>Alert</th></tr></thead><tbody>\
      ' + d.drivers.map(r => '<tr onclick="showDriver(\'' + esc(r.callsign) + '\')"><td><code>' + esc(r.callsign) + '</code></td><td>' + esc(r.driver_name||'—') + '</td><td>' + r.orders + '</td><td>' + r.completed + '</td><td>' + r.cancelled + '</td><td>' + (r.alerts ? '<span class="pill warn">' + r.alerts + '</span>' : '0') + '</td></tr>').join('') + '\
    </tbody></table></div>';
}

// ===== Modal: Order Detail =====
async function showOrder(orderId) {
  openModal('<div class="empty">⏳ Yuklanmoqda...</div>');
  const d = await api('/api/order?id=' + orderId);
  if (!d.order) { document.getElementById('modalBody').innerHTML = 'Zakaz topilmadi'; return; }
  const o = d.order;
  document.getElementById('modalBody').innerHTML = '\
  <h2 style="margin-bottom:16px">📦 Zakaz <code>' + o.order_id + '</code></h2>\
  <div class="grid">\
    <div class="card info"><div class="label">Sana</div><div class="value" style="font-size:18px">' + esc(o.date) + ' ' + esc(o.time) + '</div></div>\
    <div class="card info"><div class="label">Hudud</div><div class="value" style="font-size:18px">' + esc(o.region||'—') + '</div></div>\
    <div class="card ' + (o.distance_km!==null && o.distance_km < 0.5 ? 'danger' : 'info') + '"><div class="label">Masofa</div><div class="value">' + fmtKm(o.distance_km) + '</div></div>\
    <div class="card info"><div class="label">Vaqt</div><div class="value">' + fmtSek(o.duration_sec) + '</div></div>\
    <div class="card info"><div class="label">Narx</div><div class="value">' + fmtNarx(o.amount) + '</div></div>\
    <div class="card ' + statusClass(o.status) + '"><div class="label">Status</div><div class="value" style="font-size:18px">' + statusLabel(o.status) + '</div></div>\
  </div>\
  <div class="panel">\
    <h2>Tafsilotlar</h2>\
    <p>👤 <b>Haydovchi:</b> ' + esc(o.driver_name||'—') + ' <code>' + esc(o.callsign||'—') + '</code></p>\
    <p>🚗 <b>Mashina:</b> ' + esc(o.car||'—') + '</p>\
    <p>📞 <b>Mijoz:</b> <code>' + esc(o.client_phone||'—') + '</code></p>\
    <p>🛣 <b>Manzil:</b> ' + esc(o.address||'—') + '</p>\
    <p>💳 <b>Tarif:</b> ' + esc(o.tariff||'—') + '</p>\
    ' + (o.fraud_score ? '<p style="margin-top:12px"><b>🎯 Shubha balli:</b> <span class="pill ' + scoreClass(o.fraud_score) + '">' + o.fraud_score + '</span></p><p class="muted">' + esc(o.fraud_reasons||'') + '</p>' : '') + '\
  </div>';
}

function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }

// Start
refreshStatus();
setInterval(refreshStatus, 2000);
render();
setInterval(() => { if (currentPage === 'home') render(); }, 5000);
</script>
</body>
</html>`;

function send(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const ROUTES: Record<string, (q: URLSearchParams) => unknown> = {
  '/api/overview': () => {
    const t = today();
    const ordersToday = (db.prepare('SELECT COUNT(*) as c FROM orders WHERE date = ?').get(t) as { c: number }).c;
    const alertsToday = (db.prepare(`SELECT COUNT(*) as c FROM fraud_alerts WHERE date(created_at) = ?`).get(t) as { c: number }).c;
    const blocksTotal = (db.prepare('SELECT COUNT(*) as c FROM driver_blocks').get() as { c: number }).c;
    const alertsLastHour = (db.prepare(`SELECT COUNT(*) as c FROM fraud_alerts WHERE datetime(created_at) >= datetime('now', '-1 hour')`).get() as { c: number }).c;
    const state = db.prepare(`SELECT last_tick_at, tick_count, site_total_today, our_count_today FROM monitor_state WHERE id = 1`).get() as { last_tick_at: string | null; tick_count: number; site_total_today: number; our_count_today: number } | undefined;
    let secondsSinceLastTick: number | null = null;
    if (state?.last_tick_at) {
      const dt = new Date(state.last_tick_at + 'Z').getTime();
      if (!isNaN(dt)) secondsSinceLastTick = Math.round((Date.now() - dt) / 1000);
    }
    const siteTotal = state?.site_total_today ?? null;
    const ourCount = state?.our_count_today ?? ordersToday;
    const coveragePct = siteTotal && siteTotal > 0 ? Math.round((ourCount / siteTotal) * 1000) / 10 : null;
    const recent = (db.prepare(`SELECT COUNT(*) as c FROM orders WHERE datetime(scraped_at) >= datetime('now', '-5 minutes')`).get() as { c: number }).c;
    const rate = Math.round((recent / 5) * 10) / 10;
    return { ordersToday, alertsToday, blocksTotal, alertsLastHour, secondsSinceLastTick, coveragePct, siteTotalToday: siteTotal, ourCountToday: ourCount, tickCount: state?.tick_count ?? 0, rate };
  },

  '/api/regions': () => {
    const t = today();
    const items = db.prepare(`
      SELECT region,
        COUNT(*) as orders,
        SUM(CASE WHEN status = 'finish' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'order_cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN fraud_score >= 50 THEN 1 ELSE 0 END) as alerts,
        (SELECT COUNT(*) FROM driver_blocks db2 WHERE db2.callsign IN (SELECT callsign FROM orders o2 WHERE o2.region = orders.region)) as blocks,
        (SELECT driver_name FROM orders o3 WHERE o3.region = orders.region AND o3.date = ? GROUP BY driver_name ORDER BY COUNT(*) DESC LIMIT 1) as topDriver
      FROM orders
      WHERE date = ? AND region != '' AND region IS NOT NULL
      GROUP BY region
      ORDER BY orders DESC
    `).all(t, t);
    return { items };
  },

  '/api/region': (q) => {
    const name = q.get('name') ?? '';
    const t = today();
    const stats = {
      today: (db.prepare('SELECT COUNT(*) as c FROM orders WHERE date = ? AND region = ?').get(t, name) as { c: number }).c,
      completed: (db.prepare(`SELECT COUNT(*) as c FROM orders WHERE date = ? AND region = ? AND status = 'finish'`).get(t, name) as { c: number }).c,
      cancelled: (db.prepare(`SELECT COUNT(*) as c FROM orders WHERE date = ? AND region = ? AND status = 'order_cancelled'`).get(t, name) as { c: number }).c,
      alerts: (db.prepare(`SELECT COUNT(*) as c FROM orders WHERE date = ? AND region = ? AND fraud_score >= 50`).get(t, name) as { c: number }).c,
    };
    const drivers = db.prepare(`
      SELECT callsign, driver_name,
        COUNT(*) as orders,
        SUM(CASE WHEN status = 'finish' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'order_cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN fraud_score >= 50 THEN 1 ELSE 0 END) as alerts
      FROM orders
      WHERE region = ? AND date = ? AND callsign != ''
      GROUP BY callsign, driver_name
      ORDER BY orders DESC LIMIT 30
    `).all(name, t);
    return { stats, drivers };
  },

  '/api/drivers': (q) => {
    const search = (q.get('q') ?? '').trim();
    const sort = q.get('sort') ?? 'alerts';
    const order = sort === 'orders' ? 'orders DESC' : sort === 'cancel' ? 'cancelled DESC' : sort === 'score' ? 'total_score DESC' : 'alerts DESC';
    const where = search ? `WHERE (driver_name LIKE @s OR callsign LIKE @s) AND callsign != ''` : `WHERE callsign != ''`;
    const items = db.prepare(`
      SELECT o.callsign, o.driver_name,
        COUNT(*) as orders,
        SUM(CASE WHEN o.status = 'finish' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN o.status = 'order_cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN o.fraud_score >= 50 THEN 1 ELSE 0 END) as alerts,
        COALESCE(SUM(o.fraud_score), 0) as total_score,
        (SELECT 1 FROM driver_blocks db2 WHERE db2.callsign = o.callsign) as is_blocked
      FROM orders o
      ${where}
      GROUP BY o.callsign, o.driver_name
      ORDER BY ${order}
      LIMIT 200
    `).all({ s: `%${search}%` });
    return { items };
  },

  '/api/driver': (q) => {
    const callsign = q.get('callsign') ?? '';
    const totalRow = db.prepare(`SELECT COUNT(*) as c, COALESCE(SUM(fraud_score),0) as ts FROM orders WHERE callsign = ?`).get(callsign) as { c: number; ts: number };
    const finRow = db.prepare(`SELECT COUNT(*) as c FROM orders WHERE callsign = ? AND status = 'finish'`).get(callsign) as { c: number };
    const cancRow = db.prepare(`SELECT COUNT(*) as c FROM orders WHERE callsign = ? AND status = 'order_cancelled'`).get(callsign) as { c: number };
    const alRow = db.prepare(`SELECT COUNT(*) as c FROM fraud_alerts WHERE callsign = ?`).get(callsign) as { c: number };
    const block = db.prepare(`SELECT 1 as c FROM driver_blocks WHERE callsign = ?`).get(callsign) as { c: number } | undefined;
    const first = db.prepare(`SELECT driver_name FROM orders WHERE callsign = ? LIMIT 1`).get(callsign) as { driver_name: string } | undefined;
    const orders = db.prepare(`
      SELECT order_id, date, time, region, distance_km, duration_sec, amount, status, fraud_score, fraud_reasons
      FROM orders WHERE callsign = ?
      ORDER BY date DESC, time DESC LIMIT 30
    `).all(callsign);
    return {
      driver_name: first?.driver_name ?? '',
      stats: { total: totalRow.c, completed: finRow.c, cancelled: cancRow.c, alerts: alRow.c, totalScore: totalRow.ts, is_blocked: !!block },
      orders,
    };
  },

  '/api/alerts': (q) => {
    const days = parseInt(q.get('days') ?? '7', 10);
    const region = (q.get('region') ?? '').trim();
    const minScore = parseInt(q.get('minScore') ?? '50', 10);
    const limit = Math.min(parseInt(q.get('limit') ?? '50', 10), 1000);
    const params: Record<string, unknown> = { days, min: minScore };
    let where = `a.fraud_score >= @min AND date(a.created_at) >= date('now', '-' || @days || ' days')`;
    if (region) {
      where += ` AND o.region = @r`;
      params.r = region;
    }
    const items = db.prepare(`
      SELECT a.id, a.order_id, a.callsign, a.driver_name, a.fraud_score, a.details, a.created_at,
             a.action_taken, a.action_by, a.action_at, a.action_note,
             o.distance_km, o.duration_sec, o.amount, o.region, o.status
      FROM fraud_alerts a LEFT JOIN orders o ON o.order_id = a.order_id
      WHERE ${where}
      ORDER BY a.created_at DESC LIMIT @lim
    `).all({ ...params, lim: limit });
    return { items };
  },

  '/api/blocks': (q) => {
    const limit = Math.min(parseInt(q.get('limit') ?? '50', 10), 500);
    const items = db.prepare(`
      SELECT callsign, driver_name, alert_count, total_score, reason, blocked_at
      FROM driver_blocks ORDER BY blocked_at DESC LIMIT ?
    `).all(limit);
    return { items };
  },

  '/api/orders': (q) => {
    const date = q.get('date') || today();
    const region = (q.get('region') ?? '').trim();
    const status = (q.get('status') ?? '').trim();
    const driver = (q.get('driver') ?? '').trim();
    const limit = Math.min(parseInt(q.get('limit') ?? '200', 10), 2000);
    const params: Record<string, unknown> = { date };
    let where = `date = @date`;
    if (region) { where += ` AND region = @r`; params.r = region; }
    if (status) { where += ` AND status = @s`; params.s = status; }
    if (driver) { where += ` AND (callsign LIKE @d OR driver_name LIKE @d)`; params.d = `%${driver}%`; }
    const total = (db.prepare(`SELECT COUNT(*) as c FROM orders WHERE ${where}`).get(params) as { c: number }).c;
    const items = db.prepare(`
      SELECT order_id, callsign, driver_name, region, date, time, distance_km, amount, status, fraud_score
      FROM orders WHERE ${where} ORDER BY time DESC LIMIT @lim
    `).all({ ...params, lim: limit });
    return { total, items };
  },

  '/api/order': (q) => {
    const id = parseInt(q.get('id') ?? '0', 10);
    const order = db.prepare(`SELECT * FROM orders WHERE order_id = ?`).get(id);
    return { order };
  },

  '/api/clients': (q) => {
    const search = (q.get('q') ?? '').trim();
    const where = search
      ? `client_phone LIKE @s AND client_phone != ''`
      : `client_phone != ''`;
    const items = db
      .prepare(
        `SELECT client_phone,
                COUNT(*) as orders,
                COUNT(DISTINCT driver_name) as distinct_drivers,
                (SELECT driver_name FROM orders o2 WHERE o2.client_phone = orders.client_phone GROUP BY driver_name ORDER BY COUNT(*) DESC LIMIT 1) as top_driver,
                (SELECT COUNT(*) FROM orders o3 WHERE o3.client_phone = orders.client_phone AND o3.driver_name = (SELECT driver_name FROM orders o4 WHERE o4.client_phone = orders.client_phone GROUP BY driver_name ORDER BY COUNT(*) DESC LIMIT 1)) as top_driver_count,
                GROUP_CONCAT(DISTINCT region) as regions
         FROM orders
         WHERE ${where}
         GROUP BY client_phone
         HAVING orders >= 5
         ORDER BY orders DESC, distinct_drivers ASC
         LIMIT 200`,
      )
      .all({ s: `%${search}%` });
    return { items };
  },

  '/api/report': (q) => {
    const from = q.get('from') || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = q.get('to') || new Date().toISOString().slice(0, 10);

    const summary = {
      totalOrders: (db.prepare(`SELECT COUNT(*) as c FROM orders WHERE date BETWEEN ? AND ?`).get(from, to) as { c: number }).c,
      completed: (db.prepare(`SELECT COUNT(*) as c FROM orders WHERE date BETWEEN ? AND ? AND status = 'finish'`).get(from, to) as { c: number }).c,
      cancelled: (db.prepare(`SELECT COUNT(*) as c FROM orders WHERE date BETWEEN ? AND ? AND status = 'order_cancelled'`).get(from, to) as { c: number }).c,
      alerts: (db.prepare(`SELECT COUNT(*) as c FROM fraud_alerts WHERE date(created_at) BETWEEN ? AND ?`).get(from, to) as { c: number }).c,
      blocks: (db.prepare(`SELECT COUNT(*) as c FROM driver_blocks WHERE date(blocked_at) BETWEEN ? AND ?`).get(from, to) as { c: number }).c,
      suspectClients: (db.prepare(`
        SELECT COUNT(*) as c FROM (
          SELECT client_phone FROM orders
          WHERE date BETWEEN ? AND ? AND client_phone != ''
          GROUP BY client_phone
          HAVING COUNT(*) >= 5 AND COUNT(DISTINCT driver_name) <= 2
        )
      `).get(from, to) as { c: number }).c,
    };

    const byRegion = db.prepare(`
      SELECT region, COUNT(*) as orders,
             (SELECT COUNT(*) FROM fraud_alerts a JOIN orders o2 ON o2.order_id = a.order_id WHERE o2.region = orders.region AND date(a.created_at) BETWEEN ? AND ?) as alerts
      FROM orders WHERE date BETWEEN ? AND ? AND region != '' AND region IS NOT NULL
      GROUP BY region ORDER BY orders DESC
    `).all(from, to, from, to);

    const topDrivers = db.prepare(`
      SELECT callsign, driver_name, COUNT(*) as alerts, SUM(fraud_score) as total
      FROM fraud_alerts
      WHERE date(created_at) BETWEEN ? AND ?
      GROUP BY callsign, driver_name
      ORDER BY total DESC LIMIT 15
    `).all(from, to);

    const recentAlerts = db.prepare(`
      SELECT a.id, a.order_id, a.callsign, a.driver_name, a.fraud_score, a.details, a.created_at,
             o.distance_km, o.duration_sec, o.amount, o.region
      FROM fraud_alerts a LEFT JOIN orders o ON o.order_id = a.order_id
      WHERE date(a.created_at) BETWEEN ? AND ?
      ORDER BY a.created_at DESC LIMIT 20
    `).all(from, to);

    return { summary, byRegion, topDrivers, recentAlerts };
  },

  '/api/system': () => {
    const monitor = db.prepare(`SELECT last_tick_at, tick_count, site_total_today, our_count_today, consecutive_errors, last_error FROM monitor_state WHERE id = 1`).get() as Record<string, unknown> | undefined;
    const orders = (db.prepare('SELECT COUNT(*) as c FROM orders').get() as { c: number }).c;
    const alerts = (db.prepare('SELECT COUNT(*) as c FROM fraud_alerts').get() as { c: number }).c;
    const blocks = (db.prepare('SELECT COUNT(*) as c FROM driver_blocks').get() as { c: number }).c;
    return {
      monitor: monitor ?? {},
      telegram: { configured: !!(config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) },
      thresholds: FRAUD_THRESHOLDS,
      db: { path: DB_PATH, orders, alerts, blocks },
    };
  },

  '/api/drivers-full': (q) => {
    const search = (q.get('q') ?? '').trim();
    const where = search
      ? `(driver_name LIKE @s OR callsign LIKE @s OR driver_id LIKE @s)`
      : `1=1`;
    const items = db
      .prepare(
        `SELECT
           d.driver_id, d.callsign, d.first_name, d.last_name, d.fleet_name,
           d.balance, d.on_shift, d.lock_kind, d.lock_comment, d.whitelisted, d.phones,
           (SELECT COUNT(*) FROM orders WHERE callsign = d.callsign) as orders_count,
           (SELECT COUNT(*) FROM fraud_alerts WHERE callsign = d.callsign) as alerts_count,
           (SELECT COUNT(*) FROM driver_blocks WHERE callsign = d.callsign) as is_blocked,
           (SELECT COALESCE(SUM(amount), 0) FROM subsidies WHERE callsign = d.callsign) as subsidy_total
         FROM drivers d
         WHERE ${where}
         ORDER BY alerts_count DESC, orders_count DESC LIMIT 300`,
      )
      .all({ s: `%${search}%` });
    return { items };
  },

  '/api/blacklist-mirror': (q) => {
    const pattern = q.get('q') ?? '';
    const where = pattern ? `phone LIKE @p` : `1=1`;
    const items = db
      .prepare(
        `SELECT number_id, phone, enabled, scraped_at FROM blacklist_mirror
         WHERE ${where} ORDER BY scraped_at DESC LIMIT 500`,
      )
      .all({ p: `%${pattern}%` });
    const total = (db.prepare(`SELECT COUNT(*) as c FROM blacklist_mirror`).get() as { c: number }).c;
    return { items, total };
  },

  '/api/lock-kinds': () => {
    const items = db.prepare(`SELECT kind_id, name FROM lock_kinds ORDER BY name`).all();
    return { items };
  },

  '/api/source-stats': () => {
    const items = db
      .prepare(
        `SELECT source, COUNT(*) as count,
           SUM(CASE WHEN fraud_score >= 50 THEN 1 ELSE 0 END) as alerted
         FROM orders WHERE source IS NOT NULL AND source != ''
         GROUP BY source ORDER BY count DESC`,
      )
      .all();
    return { items };
  },

  '/api/cancel-stats': () => {
    const items = db
      .prepare(
        `SELECT cancel_kind, COUNT(*) as count
         FROM orders WHERE cancel_kind IS NOT NULL AND cancel_kind != ''
         GROUP BY cancel_kind ORDER BY count DESC`,
      )
      .all();
    return { items };
  },

  '/api/sites': () => {
    const items = db
      .prepare(
        `SELECT id, name, base_url, username,
                CASE WHEN length(password) > 0 THEN '***' ELSE '' END as password_mask,
                is_active, note, created_at, updated_at
         FROM site_credentials
         ORDER BY is_active DESC, id ASC`,
      )
      .all();
    return { items };
  },

  '/api/audit-log': (q) => {
    const limit = Math.min(parseInt(q.get('limit') ?? '100', 10), 1000);
    const items = db
      .prepare(
        `SELECT id, action, target_type, target_id, actor, details, created_at
         FROM audit_log ORDER BY id DESC LIMIT ?`,
      )
      .all(limit);
    return { items };
  },

  '/api/stats': () => {
    const t = today();
    const hourly = db.prepare(`
      SELECT substr(time, 1, 2) as hour, COUNT(*) as c
      FROM orders WHERE date = ? GROUP BY hour ORDER BY hour
    `).all(t) as { hour: string; c: number }[];
    const daily = db.prepare(`
      SELECT date, COUNT(*) as c FROM orders
      WHERE date >= date('now', '-7 days') GROUP BY date ORDER BY date
    `).all() as { date: string; c: number }[];
    const fraudTypeMap: Record<string, string> = {
      SOXTA_QISQA_MASOFA: 'Soxta qisqa masofa',
      QISQA_MASOFA: 'Qisqa masofa',
      JUDA_TEZ_YAKUN: 'Mijozga yetmasdan',
      SAYT_BELGISI: 'Sayt belgisi',
      TAKROR_QILMOQDA: 'Takror qilmoqda',
      OZIGA_OZI_ZAKAZ: 'O\'ziga o\'zi',
      BOSHQA_SHUBHA: 'Boshqa',
    };
    const fraudTypes = (db.prepare(`
      SELECT fraud_type as t, COUNT(*) as c FROM fraud_alerts
      WHERE date(created_at) >= date('now', '-7 days')
      GROUP BY fraud_type ORDER BY c DESC
    `).all() as { t: string; c: number }[]).map((r) => ({ label: fraudTypeMap[r.t] ?? r.t, c: r.c }));
    const topBadDrivers = db.prepare(`
      SELECT callsign, driver_name, COUNT(*) as cnt, SUM(fraud_score) as total
      FROM fraud_alerts
      WHERE date(created_at) >= date('now', '-7 days')
      GROUP BY callsign, driver_name
      ORDER BY total DESC LIMIT 10
    `).all();
    return { hourly, daily, fraudTypes, topBadDrivers };
  },
};

const ADMIN_DIST = resolve(process.cwd(), 'dist-admin');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// ===== MONITOR CONTROLLER (dashboard'dan monitor'ni boshqarish) =====
let monitorProc: ChildProcess | null = null;
const MONITOR_LOG = resolve(process.cwd(), 'monitor.log');
const MAX_LOG_LINES = 200;

function isMonitorRunning(): boolean {
  if (!monitorProc) return false;
  return monitorProc.pid != null && monitorProc.exitCode === null;
}

function appendLog(line: string): void {
  try {
    appendFileSync(MONITOR_LOG, line);
  } catch { /* ignore */ }
}

function startMonitor(): { ok: boolean; pid?: number; error?: string } {
  if (isMonitorRunning()) {
    return { ok: false, error: 'Monitor allaqachon ishlamoqda', pid: monitorProc!.pid };
  }
  try {
    writeFileSync(MONITOR_LOG, `\n=== MONITOR ${new Date().toISOString()} ===\n`);
    const isWin = process.platform === 'win32';
    // src/realtime.ts — cwd dan relative (bo'shliqli yo'l muammosini chetlash)
    const cmd = isWin ? 'npx.cmd' : 'npx';
    // shell:true bilan argumentlar joined bo'ladi, bo'shliqli yo'llar uchun quote kerak
    const args = isWin ? ['tsx', '"src/realtime.ts"'] : ['tsx', 'src/realtime.ts'];
    monitorProc = spawn(cmd, args, {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV ?? 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      shell: isWin, // .cmd uchun zarur
      windowsHide: false,
    });
    monitorProc.stdout?.on('data', (b: Buffer) => appendLog(b.toString()));
    monitorProc.stderr?.on('data', (b: Buffer) => appendLog(b.toString()));
    monitorProc.on('error', (err) => {
      appendLog(`\n=== SPAWN ERROR: ${err.message} ===\n`);
      monitorProc = null;
    });
    monitorProc.on('exit', (code) => {
      appendLog(`\n=== MONITOR EXITED code=${code} at ${new Date().toISOString()} ===\n`);
      monitorProc = null;
    });
    return { ok: true, pid: monitorProc.pid };
  } catch (err) {
    monitorProc = null;
    return { ok: false, error: (err as Error).message };
  }
}

function stopMonitor(): { ok: boolean; error?: string } {
  if (!isMonitorRunning()) {
    return { ok: false, error: 'Monitor allaqachon to\'xtagan' };
  }
  try {
    if (process.platform === 'win32') {
      // Windows'da SIGINT ishlamaydi, kill kerak
      spawn('taskkill', ['/F', '/T', '/PID', String(monitorProc!.pid)]);
    } else {
      monitorProc!.kill('SIGTERM');
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function getMonitorStatus(): {
  running: boolean;
  pid: number | null;
  uptimeSec: number | null;
  lastLogLines: string[];
} {
  let lastLines: string[] = [];
  try {
    if (existsSync(MONITOR_LOG)) {
      const text = readFileSync(MONITOR_LOG, 'utf-8');
      const all = text.split('\n');
      lastLines = all.slice(-MAX_LOG_LINES);
    }
  } catch { /* ignore */ }
  return {
    running: isMonitorRunning(),
    pid: monitorProc?.pid ?? null,
    uptimeSec: null, // could add if we track startedAt
    lastLogLines: lastLines,
  };
}

void readFile; // bekor import emas
void statSync; // bekor emas (kelajakda)

// ===== AUTH (sodda HMAC-token) =====
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 kun

function sign(value: string): string {
  return createHmac('sha256', config.AUTH_SECRET).update(value).digest('base64url');
}

function makeToken(username: string): string {
  const expires = Date.now() + TOKEN_TTL_MS;
  const payload = `${username}:${expires}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

function verifyToken(token: string | null): { ok: boolean; username?: string } {
  if (!token) return { ok: false };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false };
  const [payloadB64, sig] = parts;
  const payload = Buffer.from(payloadB64!, 'base64url').toString('utf-8');
  const expectedSig = sign(payload);
  const sigBuf = Buffer.from(sig!, 'base64url');
  const expectedBuf = Buffer.from(expectedSig, 'base64url');
  if (sigBuf.length !== expectedBuf.length) return { ok: false };
  if (!timingSafeEqual(sigBuf, expectedBuf)) return { ok: false };
  const [username, expiresStr] = payload.split(':');
  const expires = parseInt(expiresStr!, 10);
  if (!expires || Date.now() > expires) return { ok: false };
  return { ok: true, username };
}

function handleLogin(body: { username?: string; password?: string }): { ok: boolean; token?: string; error?: string } {
  if (!body.username || !body.password) return { ok: false, error: 'Login va parol kerak' };
  if (body.username !== config.ADMIN_USERNAME || body.password !== config.ADMIN_PASSWORD) {
    return { ok: false, error: 'Login yoki parol noto\'g\'ri' };
  }
  return { ok: true, token: makeToken(body.username) };
}

function getAuthFromReq(req: import('node:http').IncomingMessage): string | null {
  // Header dan
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  // Cookie dan
  const cookie = req.headers.cookie ?? '';
  const m = cookie.match(/auth_token=([^;]+)/);
  if (m) return decodeURIComponent(m[1]!);
  return null;
}

function isProtected(path: string): boolean {
  // Login endpoint, static fayllar himoyalanmagan
  if (path === '/api/login') return false;
  if (path === '/login' || path === '/login.html') return false;
  if (path.startsWith('/assets/') || path.startsWith('/icons/')) return false;
  if (path === '/' || path.endsWith('.html') || path.endsWith('.js') || path.endsWith('.css')) return false;
  // API endpointlar himoyalanadi
  return path.startsWith('/api/');
}

async function handleTelegramTest(): Promise<{ ok: boolean; error?: string }> {
  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) {
    return { ok: false, error: '.env da TELEGRAM_BOT_TOKEN va TELEGRAM_CHAT_ID kerak' };
  }
  try {
    const resp = await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.TELEGRAM_CHAT_ID,
        text: '✅ Test xabari — bot sozlangan, alertlar shu yerga keladi.',
        parse_mode: 'HTML',
      }),
    });
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const server = createServer(async (req, res) => {
  const parsed = parseUrl(req.url ?? '/', true);
  const path = parsed.pathname ?? '/';

  // CORS uchun (Vite dev server proxiga ham yordam beradi)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ===== AUTH endpoint =====
  if (req.method === 'POST' && path === '/api/login') {
    try {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        req.on('data', (c) => chunks.push(c as Buffer));
        req.on('end', () => resolve());
        req.on('error', reject);
      });
      const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
      const result = handleLogin(body);
      if (result.ok) {
        res.setHeader(
          'Set-Cookie',
          `auth_token=${encodeURIComponent(result.token!)}; Path=/; Max-Age=${TOKEN_TTL_MS / 1000}; SameSite=Lax; HttpOnly`,
        );
      }
      send(res, result.ok ? 200 : 401, result);
    } catch (err) {
      send(res, 500, { ok: false, error: (err as Error).message });
    }
    return;
  }

  if (path === '/api/me') {
    const token = getAuthFromReq(req);
    const v = verifyToken(token);
    send(res, v.ok ? 200 : 401, { ok: v.ok, username: v.username });
    return;
  }

  // Auth protection — har bir API ga
  if (isProtected(path)) {
    const v = verifyToken(getAuthFromReq(req));
    if (!v.ok) {
      send(res, 401, { ok: false, error: 'Login kerak' });
      return;
    }
  }

  // POST endpoints
  if (req.method === 'POST' && path === '/api/system/test-telegram') {
    const result = await handleTelegramTest();
    send(res, result.ok ? 200 : 400, result);
    return;
  }

  // Monitor control endpoints
  if (req.method === 'POST' && path === '/api/monitor/start') {
    send(res, 200, startMonitor());
    return;
  }
  if (req.method === 'POST' && path === '/api/monitor/stop') {
    send(res, 200, stopMonitor());
    return;
  }
  if (path === '/api/monitor/status') {
    send(res, 200, getMonitorStatus());
    return;
  }

  // Saytlar (credentials) CRUD
  if (req.method === 'POST' && path.startsWith('/api/sites')) {
    try {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        req.on('data', (c) => chunks.push(c as Buffer));
        req.on('end', () => resolve());
        req.on('error', reject);
      });
      const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');

      // POST /api/sites — yaratish
      if (path === '/api/sites') {
        if (!body.name || !body.base_url || !body.username || !body.password) {
          send(res, 400, { ok: false, error: 'Nom, URL, login, parol kerak' });
          return;
        }
        const r = db
          .prepare(
            `INSERT INTO site_credentials (name, base_url, username, password, note)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(body.name, body.base_url, body.username, body.password, body.note ?? '');
        db.prepare(
          `INSERT INTO audit_log (action, target_type, target_id, actor) VALUES ('site_add', 'site', ?, 'web')`,
        ).run(String(r.lastInsertRowid));
        send(res, 200, { ok: true, id: r.lastInsertRowid });
        return;
      }

      // POST /api/sites/:id — yangilash
      const updateMatch = path.match(/^\/api\/sites\/(\d+)$/);
      if (updateMatch) {
        const id = parseInt(updateMatch[1]!, 10);
        const sets: string[] = [];
        const vals: unknown[] = [];
        for (const f of ['name', 'base_url', 'username', 'password', 'note']) {
          if (body[f] !== undefined) {
            sets.push(`${f} = ?`);
            vals.push(body[f]);
          }
        }
        if (sets.length === 0) {
          send(res, 400, { ok: false, error: 'O\'zgartirish uchun maydon kerak' });
          return;
        }
        sets.push('updated_at = CURRENT_TIMESTAMP');
        db.prepare(`UPDATE site_credentials SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
        db.prepare(
          `INSERT INTO audit_log (action, target_type, target_id, actor) VALUES ('site_edit', 'site', ?, 'web')`,
        ).run(String(id));
        send(res, 200, { ok: true });
        return;
      }

      // POST /api/sites/:id/activate
      const activateMatch = path.match(/^\/api\/sites\/(\d+)\/activate$/);
      if (activateMatch) {
        const id = parseInt(activateMatch[1]!, 10);
        const tx = db.transaction(() => {
          db.prepare(`UPDATE site_credentials SET is_active = 0`).run();
          db.prepare(`UPDATE site_credentials SET is_active = 1 WHERE id = ?`).run(id);
        });
        tx();
        db.prepare(
          `INSERT INTO audit_log (action, target_type, target_id, actor) VALUES ('site_activate', 'site', ?, 'web')`,
        ).run(String(id));
        send(res, 200, { ok: true });
        return;
      }

      send(res, 404, { ok: false, error: 'Yo\'l noma\'lum' });
      return;
    } catch (err) {
      send(res, 500, { ok: false, error: (err as Error).message });
      return;
    }
  }

  if (req.method === 'DELETE' && path.match(/^\/api\/sites\/(\d+)$/)) {
    const id = parseInt(path.split('/')[3]!, 10);
    db.prepare(`DELETE FROM site_credentials WHERE id = ?`).run(id);
    db.prepare(
      `INSERT INTO audit_log (action, target_type, target_id, actor) VALUES ('site_delete', 'site', ?, 'web')`,
    ).run(String(id));
    send(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && path === '/api/alert/action') {
    try {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        req.on('data', (c) => chunks.push(c as Buffer));
        req.on('end', () => resolve());
        req.on('error', reject);
      });
      const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
      const v = verifyToken(getAuthFromReq(req));
      const id = parseInt(body.alertId ?? '0', 10);
      if (!id || !body.action) {
        send(res, 400, { ok: false, error: 'alertId va action kerak' });
        return;
      }
      db.prepare(
        `UPDATE fraud_alerts SET action_taken = ?, action_by = ?, action_at = CURRENT_TIMESTAMP, action_note = ?
         WHERE id = ?`,
      ).run(body.action, v.username ?? 'web', body.note ?? '', id);
      db.prepare(
        `INSERT INTO audit_log (action, target_type, target_id, actor, details)
         VALUES ('alert_action', 'alert', ?, ?, ?)`,
      ).run(String(id), v.username ?? 'web', `${body.action}: ${body.note ?? ''}`);
      send(res, 200, { ok: true });
      return;
    } catch (err) {
      send(res, 500, { ok: false, error: (err as Error).message });
      return;
    }
  }

  if (req.method === 'POST' && (path === '/api/false-positive' || path === '/api/whitelist' || path === '/api/audit')) {
    try {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        req.on('data', (c) => chunks.push(c as Buffer));
        req.on('end', () => resolve());
        req.on('error', reject);
      });
      const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');

      if (path === '/api/false-positive') {
        const id = parseInt(body.alertId ?? '0', 10);
        if (!id) { send(res, 400, { ok: false, error: 'alertId kerak' }); return; }
        const alert = db.prepare(`SELECT order_id, callsign FROM fraud_alerts WHERE id = ?`).get(id) as { order_id: number; callsign: string } | undefined;
        if (!alert) { send(res, 404, { ok: false, error: 'Alert topilmadi' }); return; }
        db.prepare(`DELETE FROM fraud_alerts WHERE id = ?`).run(id);
        db.prepare(`UPDATE orders SET false_positive = 1, fraud_score = 0, fraud_reasons = NULL WHERE order_id = ?`).run(alert.order_id);
        db.prepare(
          `INSERT INTO audit_log (action, target_type, target_id, actor, details)
           VALUES ('mark_false_positive', 'order', ?, 'web', ?)`,
        ).run(String(alert.order_id), `Callsign: ${alert.callsign}`);
        send(res, 200, { ok: true });
        return;
      }

      if (path === '/api/whitelist') {
        const callsign = (body.callsign ?? '').toString().trim();
        const action = body.action === 'remove' ? 0 : 1;
        if (!callsign) { send(res, 400, { ok: false, error: 'callsign kerak' }); return; }
        db.prepare(`UPDATE drivers SET whitelisted = ? WHERE callsign = ?`).run(action, callsign);
        db.prepare(
          `INSERT INTO audit_log (action, target_type, target_id, actor, details)
           VALUES (?, 'driver', ?, 'web', ?)`,
        ).run(action ? 'whitelist_add' : 'whitelist_remove', callsign, body.note ?? '');
        send(res, 200, { ok: true });
        return;
      }

      if (path === '/api/audit') {
        db.prepare(
          `INSERT INTO audit_log (action, target_type, target_id, actor, details)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(body.action ?? 'unknown', body.target_type ?? null, body.target_id ?? null, body.actor ?? 'web', body.details ?? '');
        send(res, 200, { ok: true });
        return;
      }
    } catch (err) {
      send(res, 500, { ok: false, error: (err as Error).message });
      return;
    }
  }

  // GET API endpoints
  const handler = ROUTES[path];
  if (handler) {
    try {
      const q = new URLSearchParams(req.url?.split('?')[1] ?? '');
      send(res, 200, handler(q));
    } catch (err) {
      send(res, 500, { error: (err as Error).message });
    }
    return;
  }

  // Static files from dist-admin (built React app)
  if (existsSync(ADMIN_DIST)) {
    let staticPath = path === '/' ? '/index.html' : path;
    let filePath = resolve(ADMIN_DIST, staticPath.slice(1));
    if (!existsSync(filePath) || !filePath.startsWith(ADMIN_DIST)) {
      // SPA fallback
      filePath = resolve(ADMIN_DIST, 'index.html');
    }
    if (existsSync(filePath)) {
      const ext = extname(filePath).toLowerCase();
      const ctype = MIME[ext] ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': ctype, 'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=86400' });
      res.end(readFileSync(filePath));
      return;
    }
  }

  // Fallback: HTML versiyasi (eski vanilla dashboard)
  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(HTML);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  logger.info({ port: PORT }, `Dashboard ishga tushdi → http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  logger.info('SIGINT — dashboard yopiladi');
  db.close();
  process.exit(0);
});

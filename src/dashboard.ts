/**
 * Web dashboard — saxifali, hududlar bo'yicha, statistika va filtrlar.
 * Foydalanish:
 *   npm run dashboard
 * Brauzer: http://localhost:4000
 */
import { createServer } from 'node:http';
import { parse as parseUrl } from 'node:url';
import { resolve, extname } from 'node:path';
import { existsSync, readFileSync, appendFileSync, writeFileSync, statSync, readFile, unlinkSync } from 'node:fs';
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

// ✨ Performance: javob keshi (in-memory) — GET /api/* uchun 15 sek TTL
// + gzip compression — dashboard'ni 5-10x tezlashtiradi.
import { gzipSync } from 'node:zlib';

interface CacheEntry { body: string; gzip?: Buffer; expiresAt: number; }
const apiCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15_000;
const NO_CACHE_PATTERNS = [
  /\/api\/login/, /\/api\/me/, /\/api\/sites/, /\/api\/monitor/,
  /\/api\/violators\/.*\/block/, /\/api\/clients\/.*\/blacklist/,
];
function shouldCache(method: string, path: string): boolean {
  if (method !== 'GET') return false;
  if (!path.startsWith('/api/')) return false;
  return !NO_CACHE_PATTERNS.some((re) => re.test(path));
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of apiCache.entries()) {
    if (v.expiresAt < now) apiCache.delete(k);
  }
}, 60_000);

function acceptsGzip(req: import('node:http').IncomingMessage): boolean {
  const enc = (req.headers['accept-encoding'] ?? '').toString();
  return /gzip/i.test(enc);
}

// send() body'ni res'ga yozayotganda intercept qilamiz —
// (a) gzip compression
// (b) cacheable bo'lsa, cache'ga yozish
function send(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  const bodyStr = JSON.stringify(body);
  // @ts-expect-error helper props set in server handler
  const req = res.__req as import('node:http').IncomingMessage | undefined;
  // @ts-expect-error helper props set in server handler
  const cacheKey = res.__cacheKey as string | undefined;

  const useGzip = !!req && acceptsGzip(req) && bodyStr.length > 1024;
  const gzipBuf = useGzip ? gzipSync(bodyStr) : undefined;

  if (cacheKey && status >= 200 && status < 300) {
    apiCache.set(cacheKey, { body: bodyStr, gzip: gzipBuf, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  };
  if (useGzip && gzipBuf) {
    headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = String(gzipBuf.length);
    res.writeHead(status, headers);
    res.end(gzipBuf);
  } else {
    headers['Content-Length'] = String(Buffer.byteLength(bodyStr));
    res.writeHead(status, headers);
    res.end(bodyStr);
  }
}

function today(): string {
  // UZ (Asia/Tashkent, UTC+5) vaqti bo'yicha bugungi sana
  const utcMs = Date.now();
  const uzMs = utcMs + 5 * 60 * 60 * 1000;
  return new Date(uzMs).toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  // UZ vaqti bo'yicha N kun ortga sana (YYYY-MM-DD)
  const utcMs = Date.now();
  const uzMs = utcMs + 5 * 60 * 60 * 1000 - n * 24 * 60 * 60 * 1000;
  return new Date(uzMs).toISOString().slice(0, 10);
}

// Simple in-memory cache (5-30 sek TTL) — analytics endpoint takror so'rovi tezroq
const cache: Map<string, { value: unknown; expiresAt: number }> = new Map();
function withCache<T>(key: string, ttlMs: number, fn: () => T): T {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;
  const value = fn();
  cache.set(key, { value, expiresAt: now + ttlMs });
  // Cache size'ni cheklash (memory leak'dan saqlash)
  if (cache.size > 100) {
    for (const [k, v] of cache.entries()) {
      if (v.expiresAt < now) cache.delete(k);
    }
  }
  return value;
}

const ROUTES: Record<string, (q: URLSearchParams) => unknown> = {
  '/api/overview': () => {
    const t = today();
    const ordersToday = (db.prepare('SELECT COUNT(*) as c FROM orders WHERE date = ?').get(t) as { c: number }).c;
    const alertsToday = (db.prepare(`SELECT COUNT(*) as c FROM fraud_alerts WHERE date(created_at) = ?`).get(t) as { c: number }).c;
    const blocksTotal = (db.prepare('SELECT COUNT(*) as c FROM driver_blocks').get() as { c: number }).c;
    const alertsLastHour = (db.prepare(`SELECT COUNT(*) as c FROM fraud_alerts WHERE datetime(created_at) >= datetime('now', '-1 hour')`).get() as { c: number }).c;

    // Multi-site: hamma sayt'lardan jami site_total va our_count
    const allSiteStates = db
      .prepare(`SELECT COALESCE(SUM(site_total_today),0) st, COALESCE(SUM(our_count_today),0) oc, MAX(last_tick_at) lt, COALESCE(SUM(tick_count),0) tc FROM site_monitor_state`)
      .get() as { st: number; oc: number; lt: string | null; tc: number };
    // Eski monitor_state (fallback)
    const oldState = db.prepare(`SELECT last_tick_at, tick_count, site_total_today, our_count_today FROM monitor_state WHERE id = 1`).get() as { last_tick_at: string | null; tick_count: number; site_total_today: number; our_count_today: number } | undefined;

    const lastTick = allSiteStates.lt ?? oldState?.last_tick_at ?? null;
    let secondsSinceLastTick: number | null = null;
    if (lastTick) {
      const dt = new Date(lastTick + 'Z').getTime();
      if (!isNaN(dt)) secondsSinceLastTick = Math.round((Date.now() - dt) / 1000);
    }
    // Jami sayt totallari (multi-site) yoki eski
    const siteTotal = allSiteStates.st > 0 ? allSiteStates.st : (oldState?.site_total_today ?? null);
    const ourCount = ordersToday; // bizning DB'dagi haqiqiy son
    const coveragePct = siteTotal && siteTotal > 0
      ? Math.min(100, Math.round((ourCount / siteTotal) * 1000) / 10)
      : null;
    const recent = (db.prepare(`SELECT COUNT(*) as c FROM orders WHERE datetime(scraped_at) >= datetime('now', '-5 minutes')`).get() as { c: number }).c;
    const rate = Math.round((recent / 5) * 10) / 10;
    const tickCount = allSiteStates.tc > 0 ? allSiteStates.tc : (oldState?.tick_count ?? 0);
    return { ordersToday, alertsToday, blocksTotal, alertsLastHour, secondsSinceLastTick, coveragePct, siteTotalToday: siteTotal, ourCountToday: ourCount, tickCount, rate };
  },

  '/api/regions': () => {
    const t = today();
    const baseItems = db.prepare(`
      SELECT region,
        COUNT(*) as orders,
        SUM(CASE WHEN status = 'finish' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'order_cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN fraud_score >= 50 THEN 1 ELSE 0 END) as alerts
      FROM orders
      WHERE date = ? AND region != '' AND region IS NOT NULL
        AND region NOT IN (SELECT name FROM region_blacklist)
      GROUP BY region
      ORDER BY orders DESC
    `).all(t) as Array<Record<string, unknown>>;

    if (baseItems.length === 0) return { items: [] };
    // Top driver per region — bitta query
    const topDriverRows = db.prepare(`
      SELECT region, driver_name, COUNT(*) as cnt
      FROM orders WHERE date = ? AND region != '' AND driver_name != ''
      GROUP BY region, driver_name
    `).all(t) as Array<{ region: string; driver_name: string; cnt: number }>;
    const topByRegion = new Map<string, { name: string; cnt: number }>();
    for (const r of topDriverRows) {
      const cur = topByRegion.get(r.region);
      if (!cur || r.cnt > cur.cnt) {
        topByRegion.set(r.region, { name: r.driver_name, cnt: r.cnt });
      }
    }
    // Blocks count overall (umumiy)
    const blocksTotal = (db.prepare(`SELECT COUNT(*) as c FROM driver_blocks WHERE applied = 1`).get() as { c: number }).c;
    for (const it of baseItems) {
      it.topDriver = topByRegion.get(it.region as string)?.name ?? null;
      it.blocks = blocksTotal; // overall (har region uchun bir xil — yaxshilash kerak bo'lsa keyinroq)
    }
    return { items: baseItems };
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
    return withCache(`drivers:${search}:${sort}`, 5 * 60_000, () => {
    const order = sort === 'orders' ? 'orders DESC' : sort === 'cancel' ? 'cancelled DESC' : sort === 'score' ? 'total_score DESC' : 'alerts DESC';
    const where = search ? `WHERE (driver_name LIKE @s OR callsign LIKE @s) AND callsign != ''` : `WHERE callsign != ''`;
    const items = db.prepare(`
      SELECT o.callsign, o.driver_name,
        COUNT(*) as orders,
        SUM(CASE WHEN o.status = 'finish' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN o.status = 'order_cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN o.fraud_score >= 50 THEN 1 ELSE 0 END) as alerts,
        COALESCE(SUM(o.fraud_score), 0) as total_score
      FROM orders o
      ${where}
      GROUP BY o.callsign, o.driver_name
      ORDER BY ${order}
      LIMIT 200
    `).all({ s: `%${search}%` }) as Array<Record<string, unknown>>;

    // is_blocked alohida — kichik table
    if (items.length > 0) {
      const blockRows = db.prepare(`SELECT DISTINCT callsign FROM driver_blocks WHERE applied=1`).all() as Array<{ callsign: string }>;
      const blockSet = new Set(blockRows.map((r) => r.callsign));
      for (const it of items) {
        it.is_blocked = blockSet.has(it.callsign as string) ? 1 : null;
      }
    }
    return { items };
    });
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
    let where = `a.fraud_score >= @min AND date(a.created_at) >= date('now', '+5 hours', '-' || @days || ' days')`;
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
    return withCache(`clients:${search}`, 5 * 60_000, () => {
    const where = search
      ? `client_phone LIKE @s AND client_phone != ''`
      : `client_phone != ''`;
    // Avval base — clients + orders + distinct drivers
    const base = db
      .prepare(
        `SELECT client_phone,
                COUNT(*) as orders,
                COUNT(DISTINCT driver_name) as distinct_drivers,
                GROUP_CONCAT(DISTINCT region) as regions
         FROM orders
         WHERE ${where}
         GROUP BY client_phone
         HAVING orders >= 5
         ORDER BY orders DESC, distinct_drivers ASC
         LIMIT 200`,
      )
      .all({ s: `%${search}%` }) as Array<Record<string, unknown>>;

    if (base.length === 0) return { items: [] };
    // Top driver — har telefon uchun bitta query (200x kichik)
    const phones = base.map((b) => b.client_phone as string);
    const ph = phones.map(() => '?').join(',');
    const topDriverRows = db
      .prepare(
        `SELECT client_phone, driver_name, COUNT(*) as cnt FROM orders
         WHERE client_phone IN (${ph}) AND driver_name != ''
         GROUP BY client_phone, driver_name`,
      )
      .all(...phones) as Array<{ client_phone: string; driver_name: string; cnt: number }>;
    // Har telefon uchun eng yuqori driver
    const topMap = new Map<string, { name: string; cnt: number }>();
    for (const r of topDriverRows) {
      const cur = topMap.get(r.client_phone);
      if (!cur || r.cnt > cur.cnt) {
        topMap.set(r.client_phone, { name: r.driver_name, cnt: r.cnt });
      }
    }
    for (const b of base) {
      const td = topMap.get(b.client_phone as string);
      b.top_driver = td?.name ?? null;
      b.top_driver_count = td?.cnt ?? 0;
    }
    return { items: base };
    });
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

  '/api/telegram-users': () => {
    const items = db.prepare(`
      SELECT id, chat_id, full_name, username, role, regions,
             receive_alerts, receive_daily_report, receive_no_orders_alert,
             is_active, note, created_at, updated_at
      FROM telegram_users ORDER BY is_active DESC, id ASC
    `).all();
    return { items };
  },

  // Mavjud hududlar ro'yxati — UI'da multi-select uchun
  '/api/region-list': () => {
    const items = db
      .prepare(
        `SELECT region, COUNT(*) as cnt FROM orders
         WHERE region IS NOT NULL AND region != ''
         GROUP BY region ORDER BY cnt DESC`,
      )
      .all() as Array<{ region: string; cnt: number }>;
    return { items };
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

  // Soat × hafta kuni heatmap (7x24 jadval — qaysi soatda zakaz ko'p)
  '/api/heatmap': (q) => {
    const days = parseInt(q.get('days') ?? '30', 10);
    return withCache(`heatmap:${days}`, 5 * 60_000, () => {
    const cutoff = daysAgo(days);
    const rows = db
      .prepare(
        `SELECT
           CAST(strftime('%w', date) AS INTEGER) as weekday,
           CAST(substr(time, 1, 2) AS INTEGER) as hour,
           COUNT(*) as orders,
           COUNT(DISTINCT callsign) as drivers
         FROM orders
         WHERE date >= ?
           AND date IS NOT NULL AND date != ''
           AND time IS NOT NULL AND time != ''
         GROUP BY weekday, hour`,
      )
      .all(cutoff) as Array<{ weekday: number; hour: number; orders: number; drivers: number }>;

    // 7 (kun) × 24 (soat) matritsa
    const matrix: Array<Array<{ orders: number; drivers: number }>> = Array.from(
      { length: 7 },
      () => Array.from({ length: 24 }, () => ({ orders: 0, drivers: 0 })),
    );
    let max = 0;
    for (const r of rows) {
      if (r.weekday >= 0 && r.weekday < 7 && r.hour >= 0 && r.hour < 24) {
        matrix[r.weekday]![r.hour] = { orders: r.orders, drivers: r.drivers };
        if (r.orders > max) max = r.orders;
      }
    }
    return { matrix, max, days };
    });
  },

  // Haydovchilar aktivligi — ishga chiqdi/chiqmadi, yangi/yo'qotilgan
  '/api/driver-activity': (q) => {
    const inactiveThresholdDays = parseInt(q.get('inactive') ?? '7', 10);
    const newDriverDays = parseInt(q.get('newWindow') ?? '7', 10);
    return withCache(`driver-activity:${inactiveThresholdDays}:${newDriverDays}`, 5 * 60_000, () => {
    const todayStr = today();
    const weekAgo = daysAgo(7);
    // Asosiy aggregate (region MAX bilan birga)
    const baseItems = db
      .prepare(
        `SELECT
           callsign,
           MAX(driver_name) as driver_name,
           MAX(region) as region,
           MIN(date) as first_date,
           MAX(date) as last_date,
           COUNT(*) as total_orders,
           SUM(CASE WHEN status='finish' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status='order_cancelled' THEN 1 ELSE 0 END) as cancelled,
           SUM(CASE WHEN date = ? THEN 1 ELSE 0 END) as today_orders,
           SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) as week_orders,
           COALESCE(SUM(amount), 0) as total_amount
         FROM orders WHERE callsign != ''
         GROUP BY callsign
         ORDER BY total_orders DESC LIMIT 5000`,
      )
      .all(todayStr, weekAgo) as Array<Record<string, unknown>>;

    if (baseItems.length === 0) return { items: [], inactiveThresholdDays, newDriverDays };

    // drivers + blocks — kichik table'lar, hammasini olamiz
    const driverRows = db
      .prepare(`SELECT callsign, NULLIF(lock_kind, '') as lock_kind FROM drivers WHERE callsign != ''`)
      .all() as Array<{ callsign: string; lock_kind: string | null }>;
    const driverMap = new Map(driverRows.map((r) => [r.callsign, r.lock_kind]));

    const blockRows = db
      .prepare(`SELECT DISTINCT callsign FROM driver_blocks WHERE applied=1`)
      .all() as Array<{ callsign: string }>;
    const blockSet = new Set(blockRows.map((r) => r.callsign));

    const todayMs = Date.now() + 5 * 3600 * 1000;
    const items = baseItems.map((b) => {
      const cs = b.callsign as string;
      const lockKind = driverMap.get(cs) ?? null;
      const lastDate = b.last_date as string;
      const firstDate = b.first_date as string;
      const lastMs = lastDate ? new Date(lastDate + 'T00:00:00Z').getTime() : 0;
      const firstMs = firstDate ? new Date(firstDate + 'T00:00:00Z').getTime() : 0;
      const daysInactive = lastMs ? Math.floor((todayMs - lastMs) / 86400000) : 999;
      const daysSinceFirst = firstMs ? Math.floor((todayMs - firstMs) / 86400000) : 0;
      const todayOrders = b.today_orders as number;
      const weekOrders = b.week_orders as number;
      let activity_status: string;
      if (todayOrders > 0) activity_status = 'aktiv_bugun';
      else if (weekOrders > 0) activity_status = 'aktiv_hafta';
      else if (daysInactive >= inactiveThresholdDays) activity_status = 'yoqotilgan';
      else activity_status = 'kutmoqda';
      return {
        ...b,
        days_inactive: daysInactive,
        days_since_first: daysSinceFirst,
        is_site_locked: lockKind ? 1 : null,
        lock_kind: lockKind,
        our_blocked: blockSet.has(cs) ? 1 : null,
        activity_status,
        is_new: daysSinceFirst <= newDriverDays ? 1 : 0,
      };
    });
    return { items, inactiveThresholdDays, newDriverDays };
    });
  },

  // Haydovchilar retention summary — yangi/yo'qotilgan/aktiv
  '/api/driver-retention': (q) => {
    const newWindow = parseInt(q.get('newWindow') ?? '7', 10);
    const inactiveDays = parseInt(q.get('inactive') ?? '7', 10);
    return withCache(`driver-retention:${newWindow}:${inactiveDays}`, 5 * 60_000, () => {
    const todayStr = today();
    const newCutoff = daysAgo(newWindow);
    const inactiveCutoff = daysAgo(inactiveDays);
    const summary = db
      .prepare(
        `WITH ds AS (
           SELECT
             callsign,
             MIN(date) as first_date,
             MAX(date) as last_date,
             SUM(CASE WHEN date = ? THEN 1 ELSE 0 END) as today_o
           FROM orders WHERE callsign != ''
           GROUP BY callsign
         )
         SELECT
           COUNT(*) as total_drivers,
           SUM(CASE WHEN today_o > 0 THEN 1 ELSE 0 END) as active_today,
           SUM(CASE WHEN today_o = 0 AND last_date >= ? THEN 1 ELSE 0 END) as active_week,
           SUM(CASE WHEN last_date < ? THEN 1 ELSE 0 END) as churned,
           SUM(CASE WHEN first_date >= ? THEN 1 ELSE 0 END) as new_drivers
         FROM ds`,
      )
      .get(todayStr, inactiveCutoff, inactiveCutoff, newCutoff);

    // Yangi haydovchilar (region subquery'siz)
    const newOnesBase = db
      .prepare(
        `SELECT callsign, MAX(driver_name) as driver_name, MIN(date) as first_date,
                COUNT(*) as orders, COALESCE(SUM(amount), 0) as total_amount,
                MAX(region) as region
         FROM orders WHERE callsign != ''
         GROUP BY callsign
         HAVING MIN(date) >= ?
         ORDER BY first_date DESC LIMIT 100`,
      )
      .all(newCutoff);

    // Yo'qotilgan haydovchilar
    const todayMs = Date.now() + 5 * 3600 * 1000;
    const churnedBase = db
      .prepare(
        `SELECT callsign, MAX(driver_name) as driver_name, MAX(date) as last_date,
                COUNT(*) as past_orders, COALESCE(SUM(amount), 0) as past_amount,
                MAX(region) as region
         FROM orders WHERE callsign != ''
         GROUP BY callsign
         HAVING MAX(date) < ? AND COUNT(*) >= 5
         ORDER BY past_orders DESC LIMIT 200`,
      )
      .all(inactiveCutoff) as Array<Record<string, unknown>>;

    // lock_kind ni alohida olib qo'shamiz (faqat churned uchun, 200 ta)
    if (churnedBase.length > 0) {
      const cs = churnedBase.map((r) => r.callsign as string);
      const ph = cs.map(() => '?').join(',');
      const lockRows = db
        .prepare(`SELECT callsign, NULLIF(lock_kind, '') as lock_kind FROM drivers WHERE callsign IN (${ph})`)
        .all(...cs) as Array<{ callsign: string; lock_kind: string | null }>;
      const lockMap = new Map(lockRows.map((r) => [r.callsign, r.lock_kind]));
      for (const r of churnedBase) {
        const lastDate = r.last_date as string;
        const lastMs = lastDate ? new Date(lastDate + 'T00:00:00Z').getTime() : todayMs;
        r.days_inactive = Math.floor((todayMs - lastMs) / 86400000);
        r.lock_kind = lockMap.get(r.callsign as string) ?? null;
      }
    }

    return { summary, newOnes: newOnesBase, churnedOnes: churnedBase, newWindow, inactiveDays };
    });
  },

  // Mijoz to'liq tarixi
  '/api/client': (q) => {
    let phone = (q.get('phone') ?? '').trim();
    // URL'da `+` → ` ` (space) bo'lib qoladi — qaytaramiz
    if (phone.startsWith(' ')) phone = '+' + phone.slice(1);
    if (/^\d{12}$/.test(phone)) phone = '+' + phone;
    if (!phone) return { error: 'phone kerak' };
    const summary = db
      .prepare(
        `SELECT
           COUNT(*) as orders_total,
           SUM(CASE WHEN status='finish' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status='order_cancelled' THEN 1 ELSE 0 END) as cancelled,
           SUM(CASE WHEN cancel_kind='Клиент не берет трубку' THEN 1 ELSE 0 END) as no_answer,
           SUM(CASE WHEN cancel_kind='Клиент уже уехал' THEN 1 ELSE 0 END) as already_left,
           COUNT(DISTINCT driver_name) as drivers_used,
           COALESCE(SUM(amount), 0) as total_spent,
           COALESCE(AVG(amount), 0) as avg_check,
           MIN(date) as first_order,
           MAX(date) as last_order
         FROM orders WHERE client_phone = ?`,
      )
      .get(phone) as Record<string, unknown>;

    const byRegion = db
      .prepare(
        `SELECT region, COUNT(*) as cnt FROM orders
         WHERE client_phone = ? AND region != '' AND region IS NOT NULL
         GROUP BY region ORDER BY cnt DESC LIMIT 10`,
      )
      .all(phone);

    const byDriver = db
      .prepare(
        `SELECT callsign, driver_name, COUNT(*) as cnt FROM orders
         WHERE client_phone = ? GROUP BY callsign, driver_name
         ORDER BY cnt DESC LIMIT 10`,
      )
      .all(phone);

    const recentOrders = db
      .prepare(
        `SELECT order_id, callsign, driver_name, region, date, time,
                distance_km, amount, status, cancel_kind, address
         FROM orders WHERE client_phone = ?
         ORDER BY date DESC, time DESC LIMIT 100`,
      )
      .all(phone);

    return { summary, byRegion, byDriver, recentOrders };
  },

  // Daromad bo'yicha top haydovchilar
  '/api/top-earners': (q) => {
    const days = parseInt(q.get('days') ?? '30', 10);
    return withCache(`top-earners:${days}`, 5 * 60_000, () => {
    const cutoff = daysAgo(days);
    const cutoffIso = cutoff + 'T00:00:00';
    // Asosiy aggregate (region aynan MAX bilan — kompozit index kifoyat qiladi)
    const items = db
      .prepare(
        `SELECT
           callsign,
           MAX(driver_name) as driver_name,
           MAX(region) as region,
           COUNT(*) as orders,
           SUM(CASE WHEN status='finish' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status='order_cancelled' THEN 1 ELSE 0 END) as cancelled,
           COALESCE(SUM(amount), 0) as total_amount,
           COALESCE(AVG(amount), 0) as avg_check,
           COALESCE(SUM(distance_km), 0) as total_km
         FROM orders
         WHERE date >= ? AND callsign != ''
         GROUP BY callsign
         HAVING orders >= 3
         ORDER BY total_amount DESC LIMIT 200`,
      )
      .all(cutoff) as Array<Record<string, unknown>>;

    if (items.length === 0) return { items };

    // Alerts — bitta query
    const alertRows = db
      .prepare(
        `SELECT callsign, COUNT(*) as cnt FROM fraud_alerts
         WHERE created_at >= ? AND callsign != ''
         GROUP BY callsign`,
      )
      .all(cutoffIso) as Array<{ callsign: string; cnt: number }>;
    const alertMap = new Map(alertRows.map((r) => [r.callsign, r.cnt]));

    // Blocks (kichik table, hammasini olamiz)
    const blockRows = db
      .prepare(`SELECT DISTINCT callsign FROM driver_blocks WHERE applied = 1`)
      .all() as Array<{ callsign: string }>;
    const blockSet = new Set(blockRows.map((r) => r.callsign));

    for (const it of items) {
      const cs = it.callsign as string;
      it.alerts = alertMap.get(cs) ?? 0;
      it.is_blocked = blockSet.has(cs) ? 1 : null;
    }
    return { items };
    });
  },

  // Mijoz blacklist tavsiyasi — bekorlar ko'p mijozlar
  '/api/client-blacklist-recommend': (q) => {
    const days = parseInt(q.get('days') ?? '30', 10);
    return withCache(`client-blacklist:${days}`, 5 * 60_000, () => {
    const items = db
      .prepare(
        `SELECT
           client_phone,
           COUNT(*) as orders_total,
           SUM(CASE WHEN status='order_cancelled' THEN 1 ELSE 0 END) as cancelled,
           SUM(CASE WHEN cancel_kind='Клиент не берет трубку' THEN 1 ELSE 0 END) as no_answer,
           SUM(CASE WHEN cancel_kind='Клиент уже уехал' THEN 1 ELSE 0 END) as already_left,
           SUM(CASE WHEN cancel_kind='По вине клиента' THEN 1 ELSE 0 END) as client_fault,
           ROUND(100.0 * SUM(CASE WHEN status='order_cancelled' THEN 1 ELSE 0 END) / COUNT(*), 1) as cancel_rate,
           MAX(region) as region,
           MAX(date) as last_order
         FROM orders
         WHERE date >= ?
           AND client_phone != '' AND client_phone IS NOT NULL
         GROUP BY client_phone
         HAVING (orders_total >= 5 AND cancel_rate >= 50) OR no_answer >= 3 OR already_left >= 3
         ORDER BY cancelled DESC LIMIT 200`,
      )
      .all(daysAgo(days));
    return { items };
    });
  },

  // Mijoz retention — yangi/takror/yo'qotilgan
  '/api/client-retention': (q) => {
    const days = parseInt(q.get('days') ?? '30', 10);
    return withCache(`client-retention:${days}`, 5 * 60_000, () => {
    const cutoff = daysAgo(days);
    const churnCutoff = daysAgo(14);

    // Kunlik new vs returning
    const daily = db
      .prepare(
        `WITH client_first AS (
           SELECT client_phone, MIN(date) as first_date
           FROM orders WHERE client_phone != ''
           GROUP BY client_phone
         )
         SELECT
           o.date as day,
           COUNT(DISTINCT CASE WHEN cf.first_date = o.date THEN o.client_phone END) as new_clients,
           COUNT(DISTINCT CASE WHEN cf.first_date < o.date THEN o.client_phone END) as returning_clients,
           COUNT(DISTINCT o.client_phone) as total_clients
         FROM orders o
         JOIN client_first cf ON cf.client_phone = o.client_phone
         WHERE o.date >= ? AND o.client_phone != ''
         GROUP BY o.date
         ORDER BY o.date DESC`,
      )
      .all(cutoff);

    // Churned (yo'qotilgan) — 14+ kun zakaz qilmagan, ilgari 5+ zakaz qilgan
    const churned = db
      .prepare(
        `SELECT
           client_phone,
           COUNT(*) as past_orders,
           MAX(date) as last_order,
           MAX(region) as region
         FROM orders
         WHERE client_phone != '' AND status='finish'
         GROUP BY client_phone
         HAVING past_orders >= 5 AND MAX(date) < ?
         ORDER BY past_orders DESC LIMIT 200`,
      )
      .all(churnCutoff) as Array<Record<string, unknown>>;

    const todayMs = Date.now() + 5 * 3600 * 1000;
    for (const r of churned) {
      const lastDate = r.last_order as string;
      const lastMs = lastDate ? new Date(lastDate + 'T00:00:00Z').getTime() : todayMs;
      r.days_since = Math.floor((todayMs - lastMs) / 86400000);
    }

    return { daily, churned };
    });
  },

  // Mashhur yo'nalishlar — A → B (manzilning birinchi qismi)
  '/api/popular-routes': (q) => {
    const days = parseInt(q.get('days') ?? '7', 10);
    return withCache(`popular-routes:${days}`, 5 * 60_000, () => {
    // address: "Чиракчи, Катта Больница" — birinchi qism = hudud, ikkinchi qism = manzil
    const items = db
      .prepare(
        `SELECT
           region as from_region,
           SUBSTR(address, INSTR(address, ',') + 2) as to_address,
           COUNT(*) as count,
           ROUND(AVG(distance_km), 2) as avg_km,
           ROUND(AVG(amount)) as avg_amount,
           COUNT(DISTINCT callsign) as drivers
         FROM orders
         WHERE date >= ?
           AND region != '' AND address != '' AND INSTR(address, ',') > 0
           AND status='finish'
         GROUP BY from_region, to_address
         HAVING count >= 5
         ORDER BY count DESC LIMIT 100`,
      )
      .all(daysAgo(days));
    return { items };
    });
  },

  // Cancel breakdown — hudud × kind × soat
  '/api/cancel-breakdown': (q) => {
    const days = parseInt(q.get('days') ?? '30', 10);
    return withCache(`cancel-breakdown:${days}`, 5 * 60_000, () => {
    const cutoff = daysAgo(days);

    // Avval kindlarini olamiz va pct'ni JS'da hisoblaymiz
    const kindRows = db
      .prepare(
        `SELECT cancel_kind, COUNT(*) as cnt
         FROM orders
         WHERE cancel_kind IS NOT NULL AND date >= ?
         GROUP BY cancel_kind ORDER BY cnt DESC`,
      )
      .all(cutoff) as Array<{ cancel_kind: string; cnt: number; pct?: number }>;
    const totalCancel = kindRows.reduce((s, r) => s + r.cnt, 0);
    for (const k of kindRows) {
      k.pct = totalCancel > 0 ? Math.round((k.cnt / totalCancel) * 1000) / 10 : 0;
    }

    const byRegion = db
      .prepare(
        `SELECT region,
                SUM(CASE WHEN cancel_kind='По желанию клиента' THEN 1 ELSE 0 END) as by_client,
                SUM(CASE WHEN cancel_kind='Автоматически' THEN 1 ELSE 0 END) as auto,
                SUM(CASE WHEN cancel_kind='Клиент уже уехал' THEN 1 ELSE 0 END) as already_left,
                SUM(CASE WHEN cancel_kind='Клиент не берет трубку' THEN 1 ELSE 0 END) as no_answer,
                SUM(CASE WHEN cancel_kind='По вине водителя' THEN 1 ELSE 0 END) as driver_fault,
                SUM(CASE WHEN cancel_kind='По вине диспетчерской' THEN 1 ELSE 0 END) as dispatch_fault,
                COUNT(*) as total
         FROM orders
         WHERE cancel_kind IS NOT NULL AND region != ''
           AND date >= ?
         GROUP BY region ORDER BY total DESC`,
      )
      .all(cutoff);

    return { byKind: kindRows, byRegion };
    });
  },

  // Hududlar bo'yicha — har bir hududda nechta haydovchi ishladi, nechta zakaz
  '/api/region-stats': (q) => {
    const days = parseInt(q.get('days') ?? '7', 10);
    return withCache(`region-stats:${days}`, 3 * 60_000, () => {
    const cutoff = daysAgo(days);
    const cutoffIso = cutoff + 'T00:00:00';
    // Avval region statistikalar (asosiy)
    const items = db
      .prepare(
        `SELECT
           region,
           COUNT(*) as orders,
           SUM(CASE WHEN status='finish' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status='order_cancelled' THEN 1 ELSE 0 END) as cancelled,
           COUNT(DISTINCT callsign) as active_drivers,
           COALESCE(SUM(amount), 0) as total_amount
         FROM orders
         WHERE date >= ?
           AND region IS NOT NULL AND region != ''
         GROUP BY region
         ORDER BY orders DESC`,
      )
      .all(cutoff) as Array<Record<string, unknown>>;

    // Alert count'ni alohida — bu kichik table, faqat 1 marta
    const alertRows = db
      .prepare(
        `SELECT o.region, COUNT(DISTINCT a.id) as cnt
         FROM fraud_alerts a JOIN orders o ON o.callsign = a.callsign
         WHERE a.created_at >= ?
         GROUP BY o.region`,
      )
      .all(cutoffIso) as Array<{ region: string; cnt: number }>;
    const alertMap = new Map(alertRows.map((r) => [r.region, r.cnt]));
    for (const item of items) {
      item.alerts_count = alertMap.get(item.region as string) ?? 0;
    }
    return { items };
    });
  },

  // Kun bo'yicha — har kuni nechta haydovchi ishladi, nechta zakaz
  '/api/daily-stats': (q) => {
    const days = parseInt(q.get('days') ?? '30', 10);
    return withCache(`daily-stats:${days}`, 5 * 60_000, () => {
    const items = db
      .prepare(
        `SELECT
           date as day,
           COUNT(*) as orders,
           SUM(CASE WHEN status='finish' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status='order_cancelled' THEN 1 ELSE 0 END) as cancelled,
           COUNT(DISTINCT callsign) as active_drivers,
           COUNT(DISTINCT region) as regions,
           COALESCE(SUM(amount), 0) as total_amount,
           CAST(strftime('%w', date) AS INTEGER) as weekday
         FROM orders
         WHERE date >= date('now', '+5 hours', '-' || ? || ' days')
           AND date IS NOT NULL AND date != ''
         GROUP BY date
         ORDER BY date DESC`,
      )
      .all(days);
    return { items };
    });
  },

  // Ertaga uchun bashorat — oxirgi 14 kunni hafta kuni bo'yicha weighted
  '/api/forecast': () => {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowWeekday = tomorrow.getDay(); // 0=Yakshanba .. 6=Shanba
    const tomorrowDateStr = tomorrow.toISOString().slice(0, 10);

    // Oxirgi 28 kun ichida ertangi hafta kunidagi kunlar
    const sameWeekdayDays = db
      .prepare(
        `SELECT date, COUNT(*) as orders, COUNT(DISTINCT callsign) as drivers
         FROM orders
         WHERE date >= date('now', '+5 hours', '-28 days') AND date < date('now', '+5 hours')
           AND CAST(strftime('%w', date) AS INTEGER) = ?
         GROUP BY date
         ORDER BY date DESC
         LIMIT 6`,
      )
      .all(tomorrowWeekday) as Array<{ date: string; orders: number; drivers: number }>;

    // Oxirgi 7 kun (umumiy trend)
    const last7 = db
      .prepare(
        `SELECT date, COUNT(*) as orders, COUNT(DISTINCT callsign) as drivers
         FROM orders
         WHERE date >= date('now', '+5 hours', '-7 days') AND date < date('now', '+5 hours')
           AND date IS NOT NULL AND date != ''
         GROUP BY date
         ORDER BY date DESC`,
      )
      .all() as Array<{ date: string; orders: number; drivers: number }>;

    const avgSameWeekday = sameWeekdayDays.length
      ? Math.round(
          sameWeekdayDays.reduce((s, r) => s + r.orders, 0) / sameWeekdayDays.length,
        )
      : 0;
    const avgLast7 = last7.length
      ? Math.round(last7.reduce((s, r) => s + r.orders, 0) / last7.length)
      : 0;
    const avgDriversSameWeekday = sameWeekdayDays.length
      ? Math.round(
          sameWeekdayDays.reduce((s, r) => s + r.drivers, 0) / sameWeekdayDays.length,
        )
      : 0;

    // 60% hafta kuni o'rtachasi + 40% umumiy oxirgi 7 kun
    const predictedOrders = Math.round(avgSameWeekday * 0.6 + avgLast7 * 0.4);
    const predictedDrivers = avgDriversSameWeekday;

    return {
      tomorrow: tomorrowDateStr,
      weekday: tomorrowWeekday,
      weekdayName: ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'][tomorrowWeekday],
      predictedOrders,
      predictedDrivers,
      basedOn: {
        sameWeekdayDays,
        last7,
        avgSameWeekday,
        avgLast7,
      },
    };
  },

  '/api/violators': (q) => {
    const days = parseInt(q.get('days') ?? '7', 10);
    return withCache(`violators:${days}`, 3 * 60_000, () => {
    const cutoff = daysAgo(days);
    const cutoffIso = cutoff + 'T00:00:00';
    const items = db
      .prepare(
        `SELECT
           a.callsign,
           MAX(a.driver_name) as driver_name,
           COUNT(*) as alert_count,
           SUM(a.fraud_score) as total_score,
           MAX(a.fraud_score) as max_score,
           GROUP_CONCAT(DISTINCT a.fraud_type) as fraud_types
         FROM fraud_alerts a
         WHERE a.callsign != '' AND a.created_at >= ?
         GROUP BY a.callsign
         ORDER BY total_score DESC LIMIT 200`,
      )
      .all(cutoffIso) as Array<Record<string, unknown>>;

    if (items.length === 0) return { items };
    const callsigns = items.map((i) => i.callsign as string);
    const ph = callsigns.map(() => '?').join(',');

    // Orders count + region — aggregate'da MAX(region)
    const orderRows = db
      .prepare(
        `SELECT callsign,
                COUNT(*) as orders_count,
                SUM(CASE WHEN status='order_cancelled' THEN 1 ELSE 0 END) as cancelled_count,
                MAX(region) as region
         FROM orders WHERE callsign IN (${ph}) AND date >= ?
         GROUP BY callsign`,
      )
      .all(...callsigns, cutoff) as Array<{ callsign: string; orders_count: number; cancelled_count: number; region: string }>;
    const orderMap = new Map(orderRows.map((r) => [r.callsign, r]));

    // Drivers (kichik table — hammasi)
    const driverRows = db
      .prepare(`SELECT callsign, driver_id, office_id, NULLIF(lock_kind, '') as site_locked FROM drivers WHERE callsign != ''`)
      .all() as Array<{ callsign: string; driver_id: string; office_id: string; site_locked: string | null }>;
    const driverMap = new Map(driverRows.map((r) => [r.callsign, r]));

    const blockRows = db
      .prepare(`SELECT DISTINCT callsign FROM driver_blocks WHERE applied = 1`)
      .all() as Array<{ callsign: string }>;
    const blockSet = new Set(blockRows.map((r) => r.callsign));

    for (const it of items) {
      const cs = it.callsign as string;
      const o = orderMap.get(cs);
      const d = driverMap.get(cs);
      it.orders_count = o?.orders_count ?? 0;
      it.cancelled_count = o?.cancelled_count ?? 0;
      it.region = o?.region ?? null;
      it.site_locked = d?.site_locked ?? null;
      it.driver_id = d?.driver_id ?? null;
      it.office_id = d?.office_id ?? null;
      it.our_blocked = blockSet.has(cs) ? 1 : null;
    }
    return { items };
    });
  },

  '/api/driver-violations': (q) => {
    const callsign = q.get('callsign') ?? '';
    if (!callsign) return { items: [] };
    const items = db
      .prepare(
        `SELECT a.id, a.order_id, a.fraud_type, a.fraud_score, a.details, a.created_at,
                a.action_taken, a.action_by, a.action_at,
                o.distance_km, o.duration_sec, o.amount, o.region, o.status, o.cancel_kind,
                o.date, o.time
         FROM fraud_alerts a LEFT JOIN orders o ON o.order_id = a.order_id
         WHERE a.callsign = ?
         ORDER BY a.created_at DESC LIMIT 200`,
      )
      .all(callsign);
    return { items };
  },

  '/api/sites': () => {
    const today = new Date(Date.now() + 5*3600*1000).toISOString().slice(0, 10);
    const items = db
      .prepare(
        `SELECT s.id, s.name, s.base_url, s.username,
                CASE WHEN length(s.password) > 0 THEN '***' ELSE '' END as password_mask,
                s.is_active, s.use_proxy,
                COALESCE(s.auto_select_all, 1) as auto_select_all,
                s.note, s.created_at, s.updated_at,
                ms.last_tick_at, ms.tick_count, ms.site_total_today, ms.our_count_today,
                (SELECT COUNT(*) FROM orders WHERE site_id = s.id AND date = ?) as orders_today,
                (SELECT COUNT(*) FROM fraud_alerts WHERE site_id = s.id AND date(created_at) = ?) as alerts_today
         FROM site_credentials s
         LEFT JOIN site_monitor_state ms ON ms.site_id = s.id
         ORDER BY s.is_active DESC, s.id ASC`,
      )
      .all(today, today) as Array<{
        id: number;
        is_active: number;
        last_tick_at: string | null;
        [k: string]: unknown;
      }>;

    // Running status — pid mavjudligi va exitCode==null
    const runningIds = new Set<number>();
    for (const [siteId, m] of monitors.entries()) {
      if (m.proc.pid != null && m.proc.exitCode === null) runningIds.add(siteId);
    }
    for (const it of items) {
      it.running = runningIds.has(it.id);
      // last_tick_at dan sekund'lar farqi
      if (it.last_tick_at) {
        const ts = Date.parse(it.last_tick_at);
        it.seconds_since_tick = isNaN(ts) ? null : Math.round((Date.now() - ts) / 1000);
      } else {
        it.seconds_since_tick = null;
      }
    }
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
      WHERE date >= date('now', '+5 hours', '-7 days') GROUP BY date ORDER BY date
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
      WHERE date(created_at) >= date('now', '+5 hours', '-7 days')
      GROUP BY fraud_type ORDER BY c DESC
    `).all() as { t: string; c: number }[]).map((r) => ({ label: fraudTypeMap[r.t] ?? r.t, c: r.c }));
    const topBadDrivers = db.prepare(`
      SELECT callsign, driver_name, COUNT(*) as cnt, SUM(fraud_score) as total
      FROM fraud_alerts
      WHERE date(created_at) >= date('now', '+5 hours', '-7 days')
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

// ===== BLOCK SESSION — doimiy ochiq Playwright (tezroq bloklash uchun) =====
import type { BrowserSession } from './scraper/browser.js';
import { createBrowserSession, closeBrowserSession, humanPause } from './scraper/browser.js';
import { login } from './scraper/auth.js';
import { getDrivers, lockDriver, unlockDriver } from './scraper/drivers.js';
import { getOrderRoute, analyzeGpsSpeed } from './scraper/api.js';

let blockSession: BrowserSession | null = null;
let blockSessionLastUsed = 0;
const BLOCK_SESSION_IDLE_MS = 30 * 60 * 1000; // 30 min idle keyin yopiladi

async function getOrCreateBlockSession(): Promise<BrowserSession> {
  if (blockSession) {
    // Sessiya hayotda ekanini tekshirish
    try {
      const url = blockSession.page.url();
      if (url && !blockSession.page.isClosed()) {
        blockSessionLastUsed = Date.now();
        return blockSession;
      }
    } catch { /* fall through */ }
    try { await closeBrowserSession(blockSession); } catch { /* ignore */ }
    blockSession = null;
  }
  logger.info('Block sessiyasi yaratilmoqda...');
  // BROWSER_HEADLESS env'siz default false; biz har doim headless ishlatamiz block uchun
  const env = process.env.BROWSER_HEADLESS;
  process.env.BROWSER_HEADLESS = 'true';
  // PROXY_URL ham sozlangan bo'lishi kerak (.env'dan)
  blockSession = await createBrowserSession();
  if (env === undefined) delete process.env.BROWSER_HEADLESS;
  else process.env.BROWSER_HEADLESS = env;
  await login(blockSession);
  await blockSession.page.goto(config.ROYALTAXI_BASE_URL + '/management/archive', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await humanPause(2000, 3000);
  await blockSession.page.waitForSelector('.hv-table__body-row.hv-table__body-row--body', {
    timeout: 20_000,
  });
  blockSessionLastUsed = Date.now();
  logger.info('Block sessiyasi tayyor');
  return blockSession;
}

// Idle session'ni yopib turuvchi
setInterval(() => {
  if (blockSession && Date.now() - blockSessionLastUsed > BLOCK_SESSION_IDLE_MS) {
    logger.info('Block sessiyasi 30 daqiqa ishlatilmadi — yopilmoqda');
    closeBrowserSession(blockSession).catch(() => undefined);
    blockSession = null;
  }
}, 5 * 60 * 1000);

async function blockDriverFast(callsign: string, kind: string, comment: string, due: string | null): Promise<{
  ok: boolean;
  driverId?: string;
  officeId?: number;
  driverName?: string;
  error?: string;
}> {
  const session = await getOrCreateBlockSession();
  try {
    const found = await getDrivers(session.page, { query: callsign, limit: 5, includingDocuments: true } as never);
    const items = found.state?.items ?? [];
    if (items.length === 0) return { ok: false, error: `Haydovchi topilmadi: ${callsign}` };
    const real = items[0]!.items?.[0];
    if (!real) return { ok: false, error: `${callsign} items bo'sh` };
    const result = await lockDriver(session.page, {
      driverId: real.driverId,
      officeId: real.officeId,
      kind,
      comment,
      due,
    });
    const r = result as { status?: boolean; message?: string };
    if (r.status === false) {
      return { ok: false, error: `Sayt rad qildi: ${r.message ?? '?'}`, driverId: real.driverId, officeId: real.officeId };
    }
    blockSessionLastUsed = Date.now();
    return {
      ok: true,
      driverId: real.driverId,
      officeId: real.officeId,
      driverName: `${real.lastName} ${real.firstName}`.trim(),
    };
  } catch (err) {
    // Sessiya buzilgan bo'lsa, qayta yaratish uchun belgilash
    try { await closeBrowserSession(session); } catch { /* ignore */ }
    blockSession = null;
    return { ok: false, error: (err as Error).message };
  }
}

async function unblockDriverFast(callsign: string): Promise<{
  ok: boolean;
  driverId?: string;
  officeId?: number;
  driverName?: string;
  error?: string;
}> {
  const session = await getOrCreateBlockSession();
  try {
    const found = await getDrivers(session.page, { query: callsign, limit: 5, includingDocuments: true } as never);
    const items = found.state?.items ?? [];
    if (items.length === 0) return { ok: false, error: `Haydovchi topilmadi: ${callsign}` };
    const real = items[0]!.items?.[0];
    if (!real) return { ok: false, error: `${callsign} items bo'sh` };
    const result = await unlockDriver(session.page, {
      driverId: real.driverId,
      officeId: real.officeId,
    });
    const r = result as { status?: boolean; message?: string };
    if (r.status === false) {
      return { ok: false, error: `Sayt rad qildi: ${r.message ?? '?'}`, driverId: real.driverId, officeId: real.officeId };
    }
    blockSessionLastUsed = Date.now();
    return {
      ok: true,
      driverId: real.driverId,
      officeId: real.officeId,
      driverName: `${real.lastName} ${real.firstName}`.trim(),
    };
  } catch (err) {
    try { await closeBrowserSession(session); } catch { /* ignore */ }
    blockSession = null;
    return { ok: false, error: (err as Error).message };
  }
}

// ===== MULTI-SITE MONITOR CONTROLLER =====
// Har sayt uchun alohida child process (6 tagacha parallel)
interface MonitorChild {
  proc: ChildProcess;
  siteId: number;
  siteName: string;
  baseUrl: string;
  startedAt: number;
}
const monitors: Map<number, MonitorChild> = new Map();
const MONITOR_LOG = resolve(process.cwd(), 'monitor.log');
const MAX_LOG_LINES = 500;

function logForSite(siteId: number, line: string): void {
  appendLog(`[site#${siteId}] ${line}`);
}

function isMonitorRunning(): boolean {
  // Eski kod uchun: agar kamida bitta sayt aktiv ishlamoqda bo'lsa, true
  for (const m of monitors.values()) {
    if (m.proc.pid != null && m.proc.exitCode === null) return true;
  }
  return false;
}

// Eski kod uchun mos kelish — first running process
let monitorProc: ChildProcess | null = null;
function syncLegacyHandle(): void {
  monitorProc = null;
  for (const m of monitors.values()) {
    if (m.proc.pid != null && m.proc.exitCode === null) {
      monitorProc = m.proc;
      return;
    }
  }
}

function appendLog(line: string): void {
  try {
    appendFileSync(MONITOR_LOG, line);
  } catch { /* ignore */ }
}

interface SiteRow {
  id: number;
  name: string;
  base_url: string;
  username: string;
  password: string;
  use_proxy?: number; // 1 = chisel tunnel orqali, 0 = to'g'ridan-to'g'ri (proxysiz)
  auto_select_all?: number; // 1 = Подразделение filtrini auto-belgilash, 0 = qoldirish
}

function spawnMonitorForSite(site: SiteRow): { ok: boolean; pid?: number; error?: string } {
  const existing = monitors.get(site.id);
  if (existing && existing.proc.pid != null && existing.proc.exitCode === null) {
    return { ok: false, error: `Site ${site.id} (${site.name}) allaqachon ishlamoqda`, pid: existing.proc.pid };
  }

  // base_url normalizatsiya — har qanday path'ni olib tashlaymiz, faqat origin qoldiramiz
  // (foydalanuvchi noto'g'ri /management/archive yoki shunga o'xshash qo'shsa ham ishlasin)
  let baseUrl = site.base_url.trim().replace(/\/+$/, '');
  try {
    const u = new URL(baseUrl);
    baseUrl = `${u.protocol}//${u.host}`;
  } catch {
    // URL parse xato bo'lsa, oldingi mantiq
    baseUrl = baseUrl.replace(/\/management(\/.*)?$/, '');
  }

  // Har saytga alohida storage-state fayli
  const storagePath = resolve(process.cwd(), `storage-state-site-${site.id}.json`);
  // Eski (sayt almashgan) storage'ni o'chiramiz
  const lastUrlFile = resolve(process.cwd(), `.site-${site.id}-last-url`);
  try {
    const lastUrl = existsSync(lastUrlFile) ? readFileSync(lastUrlFile, 'utf-8').trim() : '';
    if (lastUrl !== baseUrl && existsSync(storagePath)) {
      unlinkSync(storagePath);
      logForSite(site.id, `SAYT URL o'zgardi: ${lastUrl} → ${baseUrl} | storage o'chirildi\n`);
    }
    writeFileSync(lastUrlFile, baseUrl);
  } catch (err) {
    logForSite(site.id, `last-url xato: ${(err as Error).message}\n`);
  }

  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'npx.cmd' : 'npx';
  const args = isWin ? ['tsx', '"src/realtime.ts"'] : ['tsx', 'src/realtime.ts'];

  const env: Record<string, string> = {
    ...process.env,
    ROYALTAXI_BASE_URL: baseUrl,
    ROYALTAXI_USERNAME: site.username,
    ROYALTAXI_PASSWORD: site.password,
    STORAGE_STATE_PATH: storagePath,
    SITE_ID: String(site.id),
    SITE_NAME: site.name,
    AUTO_SELECT_ALL: String(site.auto_select_all ?? 1),
    NODE_ENV: process.env.NODE_ENV ?? 'production',
  };
  // Agar sayt to'g'ridan-to'g'ri ishlasa (use_proxy=0), tunelni o'chiramiz
  if (site.use_proxy === 0) {
    env.PROXY_URL = ''; // bo'sh = proxy yo'q
    logForSite(site.id, `🌐 PROXY YO'Q — to'g'ridan-to'g'ri (tezroq)\n`);
  } else {
    // use_proxy=1 (TUNEL) — PROXY_URL dashboard env'dan meros bo'ladi
    const inheritedProxy = process.env.PROXY_URL ?? '';
    if (!inheritedProxy) {
      logForSite(
        site.id,
        `⚠️  TUNEL TANLANGAN, lekin dashboard'da PROXY_URL .env'da yo'q!\n` +
        `    Bu site (${site.name}) chisel tunnel'siz ishga tushadi.\n` +
        `    Iltimos dashboard ishga tushgan terminalda PROXY_URL=socks5://127.0.0.1:1080 sozlang.\n`,
      );
    } else {
      logForSite(site.id, `🚇 TUNEL meros olindi: ${inheritedProxy.replace(/\/\/[^@]*@/, '//***@')}\n`);
    }
  }

  logForSite(site.id, `START: ${site.name} | ${baseUrl} | user=${site.username} | proxy=${site.use_proxy === 0 ? 'NO' : (process.env.PROXY_URL || 'PROXY_URL YO\'Q!')}\n`);

  let proc: ChildProcess;
  try {
    proc = spawn(cmd, args, {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      shell: isWin,
      windowsHide: false,
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  proc.stdout?.on('data', (b: Buffer) => logForSite(site.id, b.toString()));
  proc.stderr?.on('data', (b: Buffer) => logForSite(site.id, b.toString()));
  proc.on('error', (err) => {
    logForSite(site.id, `SPAWN ERROR: ${err.message}\n`);
    monitors.delete(site.id);
    syncLegacyHandle();
  });
  proc.on('exit', (code) => {
    logForSite(site.id, `EXIT code=${code}\n`);
    monitors.delete(site.id);
    syncLegacyHandle();
  });

  monitors.set(site.id, {
    proc,
    siteId: site.id,
    siteName: site.name,
    baseUrl,
    startedAt: Date.now(),
  });
  syncLegacyHandle();
  return { ok: true, pid: proc.pid };
}

function startMonitor(): { ok: boolean; started: Array<{ id: number; name: string; pid?: number }>; skipped: Array<{ id: number; name: string; reason: string }>; error?: string } {
  try {
    if (monitors.size === 0) {
      writeFileSync(MONITOR_LOG, `\n=== MULTI-MONITOR START ${new Date().toISOString()} ===\n`);
    }

    const activeSites = db
      .prepare(
        `SELECT id, name, base_url, username, password, use_proxy, auto_select_all
         FROM site_credentials WHERE is_active = 1 ORDER BY id LIMIT 6`,
      )
      .all() as SiteRow[];

    if (activeSites.length === 0) {
      // .env'dagi default sayt — fallback
      const fallback: SiteRow = {
        id: 0,
        name: '(.env)',
        base_url: process.env.ROYALTAXI_BASE_URL ?? '',
        username: process.env.ROYALTAXI_USERNAME ?? '',
        password: process.env.ROYALTAXI_PASSWORD ?? '',
      };
      const r = spawnMonitorForSite(fallback);
      return { ok: r.ok, started: r.ok ? [{ id: 0, name: '(.env)', pid: r.pid }] : [], skipped: [], error: r.error };
    }

    const started: Array<{ id: number; name: string; pid?: number }> = [];
    const skipped: Array<{ id: number; name: string; reason: string }> = [];
    for (const s of activeSites) {
      const r = spawnMonitorForSite(s);
      if (r.ok) started.push({ id: s.id, name: s.name, pid: r.pid });
      else skipped.push({ id: s.id, name: s.name, reason: r.error ?? 'unknown' });
    }
    return { ok: started.length > 0, started, skipped };
  } catch (err) {
    return { ok: false, started: [], skipped: [], error: (err as Error).message };
  }
}

function stopMonitor(): { ok: boolean; stopped: number; error?: string } {
  let stopped = 0;
  try {
    for (const m of monitors.values()) {
      if (m.proc.pid != null && m.proc.exitCode === null) {
        try {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/F', '/T', '/PID', String(m.proc.pid)]);
          } else {
            m.proc.kill('SIGTERM');
          }
          stopped++;
        } catch (err) {
          logForSite(m.siteId, `STOP ERROR: ${(err as Error).message}\n`);
        }
      }
    }
    return { ok: stopped > 0, stopped };
  } catch (err) {
    return { ok: false, stopped, error: (err as Error).message };
  }
}

function stopMonitorForSite(siteId: number): { ok: boolean; error?: string } {
  const m = monitors.get(siteId);
  if (!m || m.proc.exitCode !== null) {
    return { ok: false, error: 'Sayt monitori ishlamayotgan' };
  }
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/F', '/T', '/PID', String(m.proc.pid)]);
    } else {
      m.proc.kill('SIGTERM');
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
  sites: Array<{ id: number; name: string; pid?: number; running: boolean; uptimeSec: number; baseUrl: string }>;
} {
  let lastLines: string[] = [];
  try {
    if (existsSync(MONITOR_LOG)) {
      const text = readFileSync(MONITOR_LOG, 'utf-8');
      const all = text.split('\n');
      lastLines = all.slice(-MAX_LOG_LINES);
    }
  } catch { /* ignore */ }
  const sites = Array.from(monitors.values()).map((m) => ({
    id: m.siteId,
    name: m.siteName,
    pid: m.proc.pid,
    running: m.proc.pid != null && m.proc.exitCode === null,
    uptimeSec: Math.round((Date.now() - m.startedAt) / 1000),
    baseUrl: m.baseUrl,
  }));
  return {
    running: isMonitorRunning(),
    pid: monitorProc?.pid ?? null,
    uptimeSec: null,
    lastLogLines: lastLines,
    sites,
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

// Rate limiting — IP boyicha login attempts
// 5 muvaffaqiyatsiz urinish / 15 min → 15 daqiqaga blok
interface LoginAttempt { count: number; firstAt: number; lockedUntil: number; }
const loginAttempts = new Map<string, LoginAttempt>();
const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const a = loginAttempts.get(ip);
  if (!a) return { allowed: true };
  if (a.lockedUntil > now) {
    return { allowed: false, retryAfter: Math.ceil((a.lockedUntil - now) / 1000) };
  }
  // Window tugagan bo'lsa, reset
  if (now - a.firstAt > ATTEMPT_WINDOW_MS) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }
  return { allowed: true };
}

function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const a = loginAttempts.get(ip);
  if (!a || now - a.firstAt > ATTEMPT_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAt: now, lockedUntil: 0 });
    return;
  }
  a.count++;
  if (a.count >= MAX_FAILED_ATTEMPTS) {
    a.lockedUntil = now + LOCKOUT_MS;
  }
}

// Eski entries'ni har 30 daqiqada tozalash
setInterval(() => {
  const now = Date.now();
  for (const [ip, a] of loginAttempts.entries()) {
    if (a.lockedUntil < now && now - a.firstAt > ATTEMPT_WINDOW_MS * 2) {
      loginAttempts.delete(ip);
    }
  }
}, 30 * 60 * 1000);

function timingSafeStringCompare(a: string, b: string): boolean {
  // Bir xil uzunlikka padding qilamiz — info leak'ni yo'q qilish uchun
  const len = Math.max(a.length, b.length);
  const bufA = Buffer.alloc(len, 0);
  const bufB = Buffer.alloc(len, 0);
  bufA.write(a);
  bufB.write(b);
  // Length bilan birga ham mismatch bo'lsa, false
  return timingSafeEqual(bufA, bufB) && a.length === b.length;
}

function handleLogin(
  body: { username?: string; password?: string },
  ip: string,
): { ok: boolean; token?: string; error?: string; lockedFor?: number } {
  // Rate limit
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return { ok: false, error: `Juda ko'p urinish. ${rl.retryAfter} sekund kuting`, lockedFor: rl.retryAfter };
  }

  if (!body.username || !body.password) {
    recordFailedAttempt(ip);
    return { ok: false, error: 'Login va parol kerak' };
  }

  // Timing-safe compare — usernameni ham, parolni ham
  const usernameOk = timingSafeStringCompare(body.username, config.ADMIN_USERNAME);
  const passwordOk = timingSafeStringCompare(body.password, config.ADMIN_PASSWORD);

  if (!usernameOk || !passwordOk) {
    recordFailedAttempt(ip);
    // Audit log
    try {
      db.prepare(
        `INSERT INTO audit_log (action, target_type, target_id, actor, details)
         VALUES ('login_failed', 'auth', ?, ?, ?)`,
      ).run(body.username, ip, JSON.stringify({ ip, time: new Date().toISOString() }));
    } catch { /* ignore */ }
    return { ok: false, error: 'Login yoki parol noto\'g\'ri' };
  }

  // Muvaffaqiyatli — attempt'larni tozalash
  loginAttempts.delete(ip);
  try {
    db.prepare(
      `INSERT INTO audit_log (action, target_type, target_id, actor)
       VALUES ('login_success', 'auth', ?, ?)`,
    ).run(body.username, ip);
  } catch { /* ignore */ }

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

  // ✨ Performance: send() ichidan foydalanish uchun req va cacheKey'ni res'ga biriktiramiz
  // @ts-expect-error helper props for send()
  res.__req = req;
  const method = req.method ?? 'GET';
  if (shouldCache(method, path)) {
    const cacheKey = `${method}:${req.url}`;
    const hit = apiCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      const useGzip = acceptsGzip(req) && !!hit.gzip;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'X-Cache': 'HIT',
      };
      if (useGzip) {
        headers['Content-Encoding'] = 'gzip';
        headers['Content-Length'] = String(hit.gzip!.length);
        res.writeHead(200, headers);
        res.end(hit.gzip);
      } else {
        headers['Content-Length'] = String(Buffer.byteLength(hit.body));
        res.writeHead(200, headers);
        res.end(hit.body);
      }
      return;
    }
    // cache miss — send() chaqirilganida cache'ga yoziladi
    // @ts-expect-error helper props for send()
    res.__cacheKey = cacheKey;
  }

  // ===== PUBLIC: Tunnel installer endpoints =====
  // Telefon (Android Termux): curl -fsSL http://46.8.194.45/install-tunnel.sh | sh
  // PC (Windows):             Royaltaxi-Tunnel.bat yuklash + admin'da ishga tushirish
  // PowerShell (admin):       iwr http://46.8.194.45/install-tunnel.ps1 -UseBasicParsing | iex
  if (req.method === 'GET' && (path === '/install-tunnel.sh' || path === '/install-tunnel.ps1' || path === '/install-tunnel.bat' || path === '/Royaltaxi-Tunnel.bat')) {
    try {
      const fileMap: Record<string, { file: string; ctype: string }> = {
        '/install-tunnel.sh':       { file: 'termux-tunnel-install.sh', ctype: 'text/x-shellscript; charset=utf-8' },
        '/install-tunnel.ps1':      { file: 'install-tunnel.ps1',       ctype: 'text/plain; charset=utf-8' },
        '/install-tunnel.bat':      { file: 'Royaltaxi-Tunnel.bat',     ctype: 'application/octet-stream' },
        '/Royaltaxi-Tunnel.bat':    { file: 'Royaltaxi-Tunnel.bat',     ctype: 'application/octet-stream' },
      };
      const entry = fileMap[path];
      if (!entry) { res.writeHead(404); res.end(); return; }
      const scriptPath = resolve(process.cwd(), 'tools', entry.file);
      if (existsSync(scriptPath)) {
        const body = readFileSync(scriptPath);
        const headers: Record<string, string> = {
          'Content-Type': entry.ctype,
          'Cache-Control': 'no-store',
          'Content-Length': String(body.length),
        };
        // .bat fayli — brauzer yuklab olsin (Save As)
        if (path.endsWith('.bat')) {
          headers['Content-Disposition'] = 'attachment; filename="Royaltaxi-Tunnel.bat"';
        }
        res.writeHead(200, headers);
        res.end(body);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('# installer fayl topilmadi');
      return;
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('# server xatosi');
      return;
    }
  }

  // ===== AUTH endpoint =====
  if (req.method === 'POST' && path === '/api/login') {
    try {
      // Body size limit — DoS himoya (max 4 KB)
      const chunks: Buffer[] = [];
      let totalSize = 0;
      const ok = await new Promise<boolean>((resolve) => {
        req.on('data', (c) => {
          totalSize += (c as Buffer).length;
          if (totalSize > 4096) { req.destroy(); resolve(false); return; }
          chunks.push(c as Buffer);
        });
        req.on('end', () => resolve(true));
        req.on('error', () => resolve(false));
      });
      if (!ok) { send(res, 413, { ok: false, error: 'Body juda katta' }); return; }

      const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
      // IP — X-Forwarded-For (nginx orqali) yoki socket
      const ipHeader = (req.headers['x-forwarded-for'] as string | undefined) ?? '';
      const ip = ipHeader.split(',')[0]!.trim() || req.socket.remoteAddress || 'unknown';
      const result = handleLogin(body, ip);
      if (result.ok) {
        const isHttps = (req.headers['x-forwarded-proto'] as string | undefined) === 'https';
        const secure = isHttps ? '; Secure' : '';
        res.setHeader(
          'Set-Cookie',
          `auth_token=${encodeURIComponent(result.token!)}; Path=/; Max-Age=${TOKEN_TTL_MS / 1000}; SameSite=Lax; HttpOnly${secure}`,
        );
      }
      // Failed login uchun 429 (Too Many) yoki 401
      const status = result.lockedFor ? 429 : (result.ok ? 200 : 401);
      send(res, status, result);
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
    const status = getMonitorStatus();
    // Per-site monitor state — DB'dan
    const siteStates = db
      .prepare(
        `SELECT s.id, s.name, s.is_active, s.base_url,
                ms.last_tick_at, ms.tick_count, ms.site_total_today, ms.our_count_today,
                ms.consecutive_errors, ms.last_error
         FROM site_credentials s
         LEFT JOIN site_monitor_state ms ON ms.site_id = s.id
         ORDER BY s.is_active DESC, s.id`,
      )
      .all();
    send(res, 200, { ...status, siteStates });
    return;
  }

  // Bitta saytni qo'lda ishga tushirish/to'xtatish
  const restartMatch = req.method === 'POST' && path.match(/^\/api\/monitor\/site\/(\d+)\/restart$/);
  if (restartMatch) {
    const siteId = parseInt(restartMatch[1]!, 10);
    stopMonitorForSite(siteId);
    const site = db
      .prepare(`SELECT id, name, base_url, username, password, use_proxy FROM site_credentials WHERE id = ?`)
      .get(siteId) as SiteRow | undefined;
    if (!site) {
      send(res, 404, { ok: false, error: 'Sayt topilmadi' });
      return;
    }
    setTimeout(() => spawnMonitorForSite(site), 1000);
    send(res, 200, { ok: true, siteId });
    return;
  }
  const stopSiteMatch = req.method === 'POST' && path.match(/^\/api\/monitor\/site\/(\d+)\/stop$/);
  if (stopSiteMatch) {
    const siteId = parseInt(stopSiteMatch[1]!, 10);
    send(res, 200, stopMonitorForSite(siteId));
    return;
  }

  // Saytlar (credentials) CRUD
  // DELETE /api/telegram-users/:id — alohida (POST/PUT blokidan oldin)
  if (req.method === 'DELETE' && path.match(/^\/api\/telegram-users\/\d+$/)) {
    const id = parseInt(path.split('/')[3]!, 10);
    const info = db.prepare(`SELECT chat_id, full_name FROM telegram_users WHERE id = ?`).get(id) as { chat_id: string; full_name: string } | undefined;
    db.prepare(`DELETE FROM telegram_users WHERE id = ?`).run(id);
    db.prepare(`INSERT INTO audit_log (action, target_type, target_id, actor, details) VALUES ('tg_user_delete', 'tg_user', ?, 'web', ?)`)
      .run(String(id), info ? `${info.full_name} (${info.chat_id})` : '');
    send(res, 200, { ok: true });
    return;
  }

  // Telegram users CRUD (POST/PUT)
  if (path.startsWith('/api/telegram-users') && req.method !== 'GET' && req.method !== 'DELETE') {
    try {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        req.on('data', (c) => chunks.push(c as Buffer));
        req.on('end', () => resolve());
        req.on('error', reject);
      });
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}') : {};

      // POST /api/telegram-users — yaratish
      if (req.method === 'POST' && path === '/api/telegram-users') {
        if (!body.chat_id) {
          send(res, 400, { ok: false, error: 'chat_id kerak' });
          return;
        }
        const regionsJson = body.regions
          ? JSON.stringify(Array.isArray(body.regions) ? body.regions : [])
          : null;
        try {
          const r = db.prepare(
            `INSERT INTO telegram_users (chat_id, full_name, username, role, regions, receive_alerts, receive_daily_report, receive_no_orders_alert, is_active, note)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            String(body.chat_id),
            body.full_name ?? null,
            body.username ?? null,
            body.role ?? 'viewer',
            regionsJson,
            body.receive_alerts === false ? 0 : 1,
            body.receive_daily_report === false ? 0 : 1,
            body.receive_no_orders_alert === false ? 0 : 1,
            body.is_active === false ? 0 : 1,
            body.note ?? null,
          );
          db.prepare(`INSERT INTO audit_log (action, target_type, target_id, actor) VALUES ('tg_user_add', 'tg_user', ?, 'web')`).run(String(r.lastInsertRowid));
          send(res, 200, { ok: true, id: r.lastInsertRowid });
        } catch (err) {
          const msg = (err as Error).message;
          if (msg.includes('UNIQUE')) {
            send(res, 400, { ok: false, error: 'Bu chat_id allaqachon ro\'yxatda' });
          } else {
            send(res, 500, { ok: false, error: msg });
          }
        }
        return;
      }

      // PUT/POST /api/telegram-users/:id — yangilash
      const editMatch = path.match(/^\/api\/telegram-users\/(\d+)$/);
      if (editMatch && (req.method === 'PUT' || req.method === 'POST')) {
        const id = parseInt(editMatch[1]!, 10);
        const fields: string[] = [];
        const values: unknown[] = [];
        if (body.full_name !== undefined) { fields.push('full_name = ?'); values.push(body.full_name); }
        if (body.username !== undefined) { fields.push('username = ?'); values.push(body.username); }
        if (body.role !== undefined) { fields.push('role = ?'); values.push(body.role); }
        if (body.regions !== undefined) {
          fields.push('regions = ?');
          values.push(body.regions ? JSON.stringify(Array.isArray(body.regions) ? body.regions : []) : null);
        }
        if (body.receive_alerts !== undefined) { fields.push('receive_alerts = ?'); values.push(body.receive_alerts ? 1 : 0); }
        if (body.receive_daily_report !== undefined) { fields.push('receive_daily_report = ?'); values.push(body.receive_daily_report ? 1 : 0); }
        if (body.receive_no_orders_alert !== undefined) { fields.push('receive_no_orders_alert = ?'); values.push(body.receive_no_orders_alert ? 1 : 0); }
        if (body.is_active !== undefined) { fields.push('is_active = ?'); values.push(body.is_active ? 1 : 0); }
        if (body.note !== undefined) { fields.push('note = ?'); values.push(body.note); }
        if (fields.length === 0) { send(res, 400, { ok: false, error: 'Yangilanadigan maydon yo\'q' }); return; }
        fields.push("updated_at = CURRENT_TIMESTAMP");
        db.prepare(`UPDATE telegram_users SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
        db.prepare(`INSERT INTO audit_log (action, target_type, target_id, actor) VALUES ('tg_user_update', 'tg_user', ?, 'web')`).run(String(id));
        send(res, 200, { ok: true });
        return;
      }

      // POST /api/telegram-users/:id/test — test xabari yuborish
      const testMatch = path.match(/^\/api\/telegram-users\/(\d+)\/test$/);
      if (testMatch && req.method === 'POST') {
        const id = parseInt(testMatch[1]!, 10);
        const user = db.prepare(`SELECT chat_id, full_name FROM telegram_users WHERE id = ?`).get(id) as { chat_id: string; full_name: string } | undefined;
        if (!user) { send(res, 404, { ok: false, error: 'User topilmadi' }); return; }
        const { sendToChat } = await import('./telegram.js');
        const ok = await sendToChat(user.chat_id, `✅ <b>Test xabari</b>\n\nSalom ${user.full_name ?? ''}! Royaltaxi AI sizga muvaffaqiyatli ulandi.`);
        send(res, ok ? 200 : 500, { ok });
        return;
      }

      send(res, 404, { ok: false, error: 'Yo\'l noma\'lum' });
      return;
    } catch (err) {
      send(res, 500, { ok: false, error: (err as Error).message });
      return;
    }
  }

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
            `INSERT INTO site_credentials (name, base_url, username, password, note, use_proxy, auto_select_all)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            body.name, body.base_url, body.username, body.password, body.note ?? '',
            body.use_proxy === false ? 0 : 1,
            body.auto_select_all === false ? 0 : 1,
          );
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
        for (const f of ['name', 'base_url', 'username', 'password', 'note', 'use_proxy', 'auto_select_all']) {
          if (body[f] !== undefined) {
            // Parol uchun: bo'sh string bo'lsa, eskini saqlaymiz (yangilamaymiz)
            if (f === 'password' && (body[f] === '' || body[f] === null)) continue;
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

      // POST /api/sites/:id/activate — TOGGLE (parallel monitoring uchun, 6 tagacha)
      const activateMatch = path.match(/^\/api\/sites\/(\d+)\/activate$/);
      if (activateMatch) {
        const id = parseInt(activateMatch[1]!, 10);
        const currentActive = db
          .prepare(`SELECT COUNT(*) as c FROM site_credentials WHERE is_active = 1`)
          .get() as { c: number };
        const current = db
          .prepare(`SELECT is_active FROM site_credentials WHERE id = ?`)
          .get(id) as { is_active: number } | undefined;
        if (!current) {
          send(res, 404, { ok: false, error: 'Sayt topilmadi' });
          return;
        }
        const newState = current.is_active === 1 ? 0 : 1;
        // 6 ta saytdan ko'p aktiv qilishga ruxsat yo'q
        if (newState === 1 && currentActive.c >= 6) {
          send(res, 400, { ok: false, error: 'Maksimum 6 sayt parallel monitoring qila olinadi' });
          return;
        }
        db.prepare(`UPDATE site_credentials SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(newState, id);
        db.prepare(
          `INSERT INTO audit_log (action, target_type, target_id, actor, details)
           VALUES ('site_toggle', 'site', ?, 'web', ?)`,
        ).run(String(id), `is_active=${newState}`);
        send(res, 200, { ok: true, is_active: newState });
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

  // Site-block: saytda haydovchini bloklash (lock-driver API'si orqali)
  if (req.method === 'POST' && path === '/api/site-block') {
    try {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        req.on('data', (c) => chunks.push(c as Buffer));
        req.on('end', () => resolve());
        req.on('error', reject);
      });
      const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
      const v = verifyToken(getAuthFromReq(req));
      const callsign = (body.callsign ?? '').toString().trim();
      const reason = (body.reason ?? '').toString().trim() || 'Fraud detection';
      const kind = (body.kind ?? 'moderation').toString();
      const due = body.due ?? null;
      if (!callsign) {
        send(res, 400, { ok: false, error: 'callsign kerak' });
        return;
      }
      db.prepare(
        `INSERT INTO audit_log (action, target_type, target_id, actor, details)
         VALUES ('site_block_request', 'driver', ?, ?, ?)`,
      ).run(callsign, v.username ?? 'web', `${kind} | ${reason} | due=${due}`);

      // Doimiy ochiq Playwright sessiya orqali — 2-3 sek
      const result = await blockDriverFast(callsign, kind, reason, due);

      if (result.ok) {
        db.prepare(
          `INSERT OR REPLACE INTO driver_blocks (callsign, driver_name, reason, total_score, alert_count, applied)
           VALUES (?, ?, ?, 0, 0, 1)`,
        ).run(callsign, result.driverName ?? callsign, `MANUAL: ${reason}`);
        // Drivers table'ni ham yangilash — site_locked ni ko'rsatish uchun
        const lastSpace = (result.driverName ?? '').lastIndexOf(' ');
        const lastName = lastSpace > 0 ? (result.driverName ?? '').slice(0, lastSpace) : (result.driverName ?? '');
        const firstName = lastSpace > 0 ? (result.driverName ?? '').slice(lastSpace + 1) : '';
        db.prepare(
          `INSERT INTO drivers (driver_id, callsign, first_name, last_name, office_id, lock_kind, lock_comment)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(driver_id) DO UPDATE SET
             callsign = excluded.callsign,
             first_name = excluded.first_name,
             last_name = excluded.last_name,
             office_id = excluded.office_id,
             lock_kind = excluded.lock_kind,
             lock_comment = excluded.lock_comment,
             scraped_at = CURRENT_TIMESTAMP`,
        ).run(
          result.driverId,
          callsign,
          firstName,
          lastName,
          String(result.officeId ?? ''),
          kind,
          reason,
        );
        db.prepare(
          `INSERT INTO audit_log (action, target_type, target_id, actor, details)
           VALUES ('site_block_done', 'driver', ?, ?, ?)`,
        ).run(callsign, v.username ?? 'web', `kind=${kind} reason=${reason}`);
      } else {
        db.prepare(
          `INSERT INTO audit_log (action, target_type, target_id, actor, details)
           VALUES ('site_block_failed', 'driver', ?, ?, ?)`,
        ).run(callsign, v.username ?? 'web', `error=${result.error ?? 'noma\'lum'}`);
      }

      send(res, result.ok ? 200 : 500, {
        ok: result.ok,
        error: result.error,
        driver: result.driverName ?? callsign,
        callsign,
        kind,
        reason,
      });
      return;
    } catch (err) {
      send(res, 500, { ok: false, error: (err as Error).message });
      return;
    }
  }

  // GPS route — bitta zakaz uchun GPS marshrut va tezlik tahlili
  if (req.method === 'POST' && path === '/api/order-route') {
    try {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        req.on('data', (c) => chunks.push(c as Buffer));
        req.on('end', () => resolve());
        req.on('error', reject);
      });
      const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
      const orderId = parseInt(body.orderId ?? '0', 10);
      if (!orderId) {
        send(res, 400, { ok: false, error: 'orderId kerak' });
        return;
      }
      const session = await getOrCreateBlockSession();
      const route = await getOrderRoute(session.page, orderId);
      // Saytdan kelgan turli kalit nomlardan birini olamiz
      const pts = (route.points ?? route.driverRoute ?? route.route ?? []) as Array<{
        lat: number; lng: number; ts?: string; speed?: number;
      }>;
      const analysis = analyzeGpsSpeed(pts);
      send(res, 200, { ok: true, orderId, analysis, pointCount: pts.length, points: pts.slice(0, 500) });
      return;
    } catch (err) {
      send(res, 500, { ok: false, error: (err as Error).message });
      return;
    }
  }

  // Region blacklist — noto'g'ri parse bo'lgan region nomini bloklash
  // POST /api/region/blacklist { name: "Yoshlar ko'chasi" } → orders.region='' qiladi
  if (req.method === 'POST' && path === '/api/region/blacklist') {
    try {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        req.on('data', (c) => chunks.push(c as Buffer));
        req.on('end', () => resolve());
        req.on('error', reject);
      });
      const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}') as { name?: string };
      const name = (body.name ?? '').trim();
      if (!name) { send(res, 400, { ok: false, error: 'name kerak' }); return; }
      db.prepare(`INSERT OR IGNORE INTO region_blacklist (name) VALUES (?)`).run(name);
      // Mavjud zakazlarni ham bo'shga chiqaramiz
      const upd = db.prepare(`UPDATE orders SET region = '' WHERE region = ?`).run(name);
      send(res, 200, { ok: true, name, updatedOrders: upd.changes });
    } catch (err) {
      send(res, 500, { ok: false, error: (err as Error).message });
    }
    return;
  }

  // GET /api/region/blacklist — barcha bloklangan region'lar ro'yxati
  if (req.method === 'GET' && path === '/api/region/blacklist') {
    const rows = db.prepare(`SELECT name, blocked_at FROM region_blacklist ORDER BY blocked_at DESC`).all();
    send(res, 200, { items: rows });
    return;
  }

  // DELETE /api/region/blacklist/:name — bloklashni bekor qilish
  if (req.method === 'DELETE' && path.startsWith('/api/region/blacklist/')) {
    const name = decodeURIComponent(path.slice('/api/region/blacklist/'.length));
    db.prepare(`DELETE FROM region_blacklist WHERE name = ?`).run(name);
    send(res, 200, { ok: true });
    return;
  }

  // Site-unblock: saytda haydovchini blokdan chiqarish
  if (req.method === 'POST' && path === '/api/site-unblock') {
    try {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        req.on('data', (c) => chunks.push(c as Buffer));
        req.on('end', () => resolve());
        req.on('error', reject);
      });
      const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
      const v = verifyToken(getAuthFromReq(req));
      const callsign = (body.callsign ?? '').toString().trim();
      if (!callsign) {
        send(res, 400, { ok: false, error: 'callsign kerak' });
        return;
      }
      db.prepare(
        `INSERT INTO audit_log (action, target_type, target_id, actor)
         VALUES ('site_unblock_request', 'driver', ?, ?)`,
      ).run(callsign, v.username ?? 'web');

      const result = await unblockDriverFast(callsign);

      if (result.ok) {
        db.prepare(`DELETE FROM driver_blocks WHERE callsign = ?`).run(callsign);
        db.prepare(
          `UPDATE drivers SET lock_kind = NULL, lock_comment = NULL, scraped_at = CURRENT_TIMESTAMP
           WHERE callsign = ?`,
        ).run(callsign);
        db.prepare(
          `INSERT INTO audit_log (action, target_type, target_id, actor)
           VALUES ('site_unblock_done', 'driver', ?, ?)`,
        ).run(callsign, v.username ?? 'web');
      } else {
        db.prepare(
          `INSERT INTO audit_log (action, target_type, target_id, actor, details)
           VALUES ('site_unblock_failed', 'driver', ?, ?, ?)`,
        ).run(callsign, v.username ?? 'web', `error=${result.error ?? 'noma\'lum'}`);
      }

      send(res, result.ok ? 200 : 500, {
        ok: result.ok,
        error: result.error,
        driver: result.driverName ?? callsign,
        callsign,
      });
      return;
    } catch (err) {
      send(res, 500, { ok: false, error: (err as Error).message });
      return;
    }
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

  // CSV export — har bir resurs uchun
  if (path.startsWith('/api/export/')) {
    try {
      const resource = path.slice('/api/export/'.length);
      const q = new URLSearchParams(req.url?.split('?')[1] ?? '');
      const days = parseInt(q.get('days') ?? '30', 10);

      let rows: Record<string, unknown>[] = [];
      let filename = `${resource}.csv`;

      if (resource === 'orders') {
        rows = db
          .prepare(
            `SELECT order_id, callsign, driver_name, region, date, time, address, client_phone,
                    distance_km, duration_sec, amount, status, cancel_kind, fraud_score, tariff, source
             FROM orders WHERE date >= date('now', '+5 hours', '-' || ? || ' days')
             ORDER BY date DESC, time DESC LIMIT 50000`,
          )
          .all(days) as Record<string, unknown>[];
        filename = `orders-${days}d.csv`;
      } else if (resource === 'alerts') {
        rows = db
          .prepare(
            `SELECT a.id, a.order_id, a.callsign, a.driver_name, a.fraud_type, a.fraud_score,
                    a.details, a.created_at, a.action_taken, o.region, o.distance_km, o.amount
             FROM fraud_alerts a LEFT JOIN orders o ON o.order_id = a.order_id
             WHERE date(a.created_at) >= date('now', '+5 hours', '-' || ? || ' days')
             ORDER BY a.created_at DESC LIMIT 50000`,
          )
          .all(days) as Record<string, unknown>[];
        filename = `alerts-${days}d.csv`;
      } else if (resource === 'violators') {
        rows = db
          .prepare(
            `SELECT a.callsign, MAX(a.driver_name) as driver_name,
                    COUNT(*) as alert_count, SUM(a.fraud_score) as total_score,
                    GROUP_CONCAT(DISTINCT a.fraud_type) as fraud_types
             FROM fraud_alerts a WHERE date(a.created_at) >= date('now', '+5 hours', '-' || ? || ' days')
             GROUP BY a.callsign ORDER BY total_score DESC LIMIT 10000`,
          )
          .all(days) as Record<string, unknown>[];
        filename = `violators-${days}d.csv`;
      } else if (resource === 'clients') {
        rows = db
          .prepare(
            `SELECT client_phone, COUNT(*) as orders, COUNT(DISTINCT driver_name) as distinct_drivers,
                    SUM(amount) as total_spent, MIN(date) as first_order, MAX(date) as last_order
             FROM orders WHERE client_phone != '' AND date >= date('now', '+5 hours', '-' || ? || ' days')
             GROUP BY client_phone HAVING orders >= 2 ORDER BY orders DESC LIMIT 10000`,
          )
          .all(days) as Record<string, unknown>[];
        filename = `clients-${days}d.csv`;
      } else if (resource === 'top-earners') {
        rows = db
          .prepare(
            `SELECT callsign, MAX(driver_name) as driver_name, COUNT(*) as orders,
                    SUM(amount) as total_amount, AVG(amount) as avg_check
             FROM orders WHERE date >= date('now', '+5 hours', '-' || ? || ' days')
             GROUP BY callsign HAVING orders >= 3 ORDER BY total_amount DESC LIMIT 10000`,
          )
          .all(days) as Record<string, unknown>[];
        filename = `top-earners-${days}d.csv`;
      } else {
        send(res, 404, { error: 'noma\'lum resurs' });
        return;
      }

      // CSV chiqarish
      if (rows.length === 0) {
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        });
        res.end('');
        return;
      }
      const headers = Object.keys(rows[0]!);
      const escape = (v: unknown): string => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };
      const csv = [
        headers.join(','),
        ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
      ].join('\n');
      // BOM — Excel UTF-8 ni to'g'ri o'qishi uchun
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      });
      res.end('﻿' + csv);
      return;
    } catch (err) {
      send(res, 500, { error: (err as Error).message });
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

  // Monitor avtomatik ishga tushadi (env MONITOR_AUTOSTART=0 bilan o'chiriladi)
  if (process.env.MONITOR_AUTOSTART !== '0') {
    setTimeout(() => {
      const r = startMonitor();
      logger.info(r, 'Monitor avto-start');
    }, 5000); // 5 sek kechikish — dashboard to'liq tayyor bo'lsin
  }

  // 🧹 AUTO-CLEANUP #1: Memory monitor — har 5 daqiqa dashboard memory'sini tekshiradi.
  // Agar 1.5 GB dan oshsa, o'zini graceful restart qiladi (pm2 qaytadan tushiradi).
  setInterval(() => {
    const mem = process.memoryUsage();
    const rssMB = Math.round(mem.rss / 1024 / 1024);
    const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
    if (rssMB > 1500) {
      logger.warn({ rssMB, heapMB }, '⚠️  Dashboard memory 1.5GB dan oshdi — auto-restart');
      process.exit(0); // pm2 avtomatik qayta tushiradi
    } else if (rssMB > 1000) {
      logger.info({ rssMB, heapMB }, 'Memory: 1GB+ (yetuk holatga yaqinlashmoqda)');
    }
  }, 5 * 60 * 1000);

  // 🧹 AUTO-CLEANUP #2: SQLite WAL checkpoint — har 30 daqiqada WAL faylni asosiy DB ga
  // qo'shib, hajmini kichraytiradi. Bu DB lock vaqtini va disk hajmini cheklayd.
  setInterval(() => {
    try {
      const result = db.pragma('wal_checkpoint(PASSIVE)') as Array<{ busy: number; log: number; checkpointed: number }>;
      const r = result?.[0];
      if (r && r.log > 5000) {
        logger.info({ log: r.log, checkpointed: r.checkpointed }, '🧹 WAL checkpoint');
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'WAL checkpoint xato');
    }
  }, 30 * 60 * 1000);

  // 🧹 AUTO-CLEANUP #2b: ANALYZE — har 24 soat. SQLite optimizer'ga
  // yangi ma'lumotlar statistikasini beradi. Yangi index ishlatilishi
  // va katta jadvallar uchun query rejasini yaxshilaydi.
  setInterval(() => {
    try {
      const t0 = Date.now();
      db.exec('ANALYZE');
      logger.info({ ms: Date.now() - t0 }, '📊 SQLite ANALYZE bajarildi (24h)');
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'ANALYZE xato');
    }
  }, 24 * 60 * 60 * 1000);

  // 🧹 AUTO-CLEANUP #3: Stale monitor — agar sayt monitor'i 30 daqiqadan ortiq vaqt ichida
  // tick yangilab turmagan bo'lsa (qotib qolgan), uni majburiy restart qiladi.
  setInterval(() => {
    try {
      const stmt = db.prepare(
        `SELECT site_id, datetime(last_tick_at) as ts,
                (julianday('now') - julianday(last_tick_at)) * 24 * 60 as minSinceTick
         FROM site_monitor_state WHERE site_id IS NOT NULL`,
      );
      const rows = stmt.all() as Array<{ site_id: number; ts: string; minSinceTick: number | null }>;
      for (const row of rows) {
        if (row.minSinceTick !== null && row.minSinceTick > 30) {
          const m = monitors.get(row.site_id);
          if (m && m.proc.pid != null && m.proc.exitCode === null) {
            logger.warn(
              { siteId: row.site_id, minSinceTick: Math.round(row.minSinceTick) },
              '⚠️  Monitor qotib qolgan (30+ daqiqa tick yo\'q) — majburiy restart',
            );
            try {
              if (process.platform === 'win32') {
                spawn('taskkill', ['/F', '/T', '/PID', String(m.proc.pid)]);
              } else {
                m.proc.kill('SIGKILL');
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Stale monitor cleanup xato');
    }
  }, 10 * 60 * 1000);

  // Orphan Chromium cleanup — har 10 daqiqada parent o'lgan chrome'larni o'ldiradi
  setInterval(async () => {
    try {
      const { spawnSync } = await import('node:child_process');
      const ps = spawnSync('ps', ['-eo', 'pid,ppid,cmd'], { encoding: 'utf8' });
      if (!ps.stdout) return;
      const lines = ps.stdout.split('\n');
      const alivePids = new Set<number>();
      for (const line of lines) {
        const m = line.trim().match(/^(\d+)\s+/);
        if (m) alivePids.add(parseInt(m[1]!, 10));
      }
      const orphans: number[] = [];
      const orphanMonitors: number[] = [];
      const allChromes: number[] = [];
      const myPid = process.pid;
      // Aktiv monitor PID'lar — bularni ham orphan deb hisoblamaymiz
      const ownedMonitorPids = new Set<number>();
      for (const m of monitors.values()) {
        if (m.proc.pid != null) ownedMonitorPids.add(m.proc.pid);
      }
      for (const line of lines) {
        const m = line.trim().match(/^(\d+)\s+(\d+)\s/);
        if (!m) continue;
        const pid = parseInt(m[1]!, 10);
        const ppid = parseInt(m[2]!, 10);

        // Orphan Chromium (parent o'lgan)
        if (line.includes('chrome-headless-shell') || line.includes('chromium')) {
          allChromes.push(pid);
          if (ppid === 1 || !alivePids.has(ppid)) {
            orphans.push(pid);
          }
        }

        // Orphan tsx realtime.ts — biz spawn qilmagan va parent init (1)
        // Bu eski dashboard restart'larida qolgan zombie monitorlar
        if (line.includes('src/realtime.ts') && pid !== myPid) {
          if (ppid === 1 && !ownedMonitorPids.has(pid)) {
            orphanMonitors.push(pid);
          }
        }
      }
      if (orphans.length > 0) {
        logger.warn({ orphans: orphans.length, allChromes: allChromes.length }, '🧹 Orphan Chromium tozalanmoqda');
        for (const pid of orphans) {
          try { process.kill(pid, 'SIGKILL'); } catch { /* ignore */ }
        }
      }
      if (orphanMonitors.length > 0) {
        logger.warn(
          { count: orphanMonitors.length, pids: orphanMonitors.slice(0, 10) },
          '🧹 Orphan monitor process\'lar tozalanmoqda (eski dashboard restartdan qolgan)',
        );
        for (const pid of orphanMonitors) {
          try { process.kill(pid, 'SIGKILL'); } catch { /* ignore */ }
        }
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Orphan cleanup xato');
    }
  }, 2 * 60 * 1000); // 10 daqiqa → 2 daqiqa (tezroq tozalash)

  // Multi-site watchdog: har 2 daqiqa — har bir is_active=1 sayt monitor'i ishlayaptimi?
  setInterval(() => {
    if (process.env.MONITOR_AUTOSTART === '0') return;
    try {
      const activeSites = db
        .prepare(
          `SELECT id, name, base_url, username, password, use_proxy
           FROM site_credentials WHERE is_active = 1 ORDER BY id LIMIT 6`,
        )
        .all() as SiteRow[];
      const activeIds = new Set(activeSites.map((s) => s.id));

      // Aktiv emas saytlar uchun ishlayotgan monitorlarni to'xtatamiz
      for (const [siteId, m] of monitors.entries()) {
        if (!activeIds.has(siteId) && m.proc.pid != null && m.proc.exitCode === null) {
          logger.info({ siteId, name: m.siteName }, 'Sayt aktiv emas — monitor to\'xtatiladi');
          stopMonitorForSite(siteId);
        }
      }

      // Aktiv saytlar uchun ishlamayotgan monitorlarni ishga tushiramiz
      for (const s of activeSites) {
        const existing = monitors.get(s.id);
        const isRunning = existing && existing.proc.pid != null && existing.proc.exitCode === null;
        if (!isRunning) {
          logger.warn({ siteId: s.id, name: s.name }, 'Monitor o\'chgan — qayta ishga tushiraman (watchdog)');
          spawnMonitorForSite(s);
        }
      }

      // Hech qaysi sayt aktiv emas va monitor ham yo'q bo'lsa — .env fallback
      if (activeSites.length === 0 && monitors.size === 0) {
        logger.info('Hech qanday aktiv sayt yo\'q — .env fallback ishga tushiraman');
        startMonitor();
      }
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Watchdog xato');
    }
  }, 2 * 60 * 1000);
});

// Graceful shutdown — barcha child process'lar va Chromium browser'larni yopish
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Dashboard yopilmoqda — child process\'lar to\'xtatiladi');

  // 1. Barcha monitor child process'lar uchun SIGTERM yuboramiz (Chromium ham yopiladi)
  for (const [siteId, m] of monitors.entries()) {
    if (m.proc.pid != null && m.proc.exitCode === null) {
      logger.info({ siteId, pid: m.proc.pid }, 'Monitor SIGTERM');
      try {
        process.kill(-m.proc.pid, 'SIGTERM'); // process group ham (Chromium child'lar bilan)
      } catch {
        try { m.proc.kill('SIGTERM'); } catch { /* ignore */ }
      }
    }
  }

  // 2. Block session (dashboard ichidagi Playwright) yopish
  if (blockSession) {
    try {
      await Promise.race([
        closeBrowserSession(blockSession),
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch { /* ignore */ }
  }

  // 3. Child'lar to'liq o'chishini kutamiz (max 5 sek)
  await new Promise<void>((resolve) => setTimeout(resolve, 3000));

  // 4. Hali tirik bo'lgan child'lar uchun SIGKILL
  for (const [siteId, m] of monitors.entries()) {
    if (m.proc.pid != null && m.proc.exitCode === null) {
      logger.warn({ siteId, pid: m.proc.pid }, 'Monitor SIGKILL (graceful muvaffaqiyatsiz)');
      try {
        process.kill(-m.proc.pid, 'SIGKILL');
      } catch {
        try { m.proc.kill('SIGKILL'); } catch { /* ignore */ }
      }
    }
  }

  // 5. Orphan Chromium + tsx monitor process'larni tozalash (ehtiyot chorasi)
  try {
    const { spawnSync } = await import('node:child_process');
    // Chromium browser
    spawnSync('pkill', ['-9', '-f', 'chrome-headless-shell'], { stdio: 'ignore' });
    // Orphan tsx monitor jarayonlari (parent yo'qolgan)
    spawnSync('pkill', ['-9', '-f', 'src/realtime.ts'], { stdio: 'ignore' });
  } catch { /* ignore */ }

  db.close();
  logger.info('Dashboard yopildi');
  process.exit(0);
}

process.on('SIGINT', () => { void gracefulShutdown('SIGINT'); });
process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });

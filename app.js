import { geocodePostal } from './lib/geo.js';
import { loadHistory, loadReport } from './lib/data.js';
import { renderHistory } from './history-view.js';
import { DISCLAIMER, LEVELS, NEA_ACTION } from './lib/advice.js';

const REFRESH_MS = 10 * 60 * 1000;
const $ = (id) => document.getElementById(id);
const ARROW = { rising: '↑ rising', falling: '↓ falling', steady: '→ steady' };

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// Postal code comes from ?postal=XXXXXX, else the one remembered in this browser.
const fromUrl = new URLSearchParams(location.search).get('postal');
if (fromUrl) store.set('haze-postal', fromUrl);
const postal = fromUrl || store.get('haze-postal');
let home = null;

async function resolveHome() {
  if (home) return home;
  try {
    const cached = JSON.parse(store.get('haze-home') || 'null');
    if (cached?.postal === postal) return (home = cached);
  } catch {}
  home = await geocodePostal(postal);
  store.set('haze-home', JSON.stringify(home));
  return home;
}

function askPostal() {
  $('verdict-label').textContent = 'Enter your postal code';
  $('verdict-note').innerHTML =
    '<form id="pf"><input id="pi" inputmode="numeric" maxlength="6" placeholder="6-digit postal code" required> <button>Save</button></form>';
  $('pf').onsubmit = (e) => {
    e.preventDefault();
    store.set('haze-postal', $('pi').value.trim());
    location.reload();
  };
}

function renderGuide(current) {
  $('guide').tBodies[0].replaceChildren(
    ...LEVELS.map((l) => {
      const tr = document.createElement('tr');
      if (l.id === current) {
        tr.className = 'current';
        tr.style.setProperty('--row', l.color);
      }
      tr.innerHTML = `<td><span class="dot" style="background:${l.color}"></span>${l.band} ${l.label}</td><td>${l.range}</td><td>${NEA_ACTION[l.id]}</td>`;
      return tr;
    }),
  );
}

function spark(series) {
  const el = $('spark');
  if (series.length < 2) return (el.innerHTML = '');
  const max = Math.max(...series, 10);
  const pts = series.map((v, i) => `${(i / (series.length - 1)) * 120},${30 - (v / max) * 28 - 1}`);
  el.innerHTML = `<polyline points="${pts.join(' ')}"/>`;
}

function render(r) {
  const ev = r.eval;
  $('where').textContent = `${r.home.postal} · nearest point: ${r.region} region (${r.distanceKm.toFixed(1)} km)`;
  const v = $('verdict');
  v.classList.remove('error');
  v.style.background = ev.level.color;
  v.style.color = ev.level.id === 1 ? '#1c1f24' : '#fff';
  $('verdict-label').textContent = `${ev.level.label} (Band ${ev.level.band})`;
  $('verdict-note').textContent = ev.note || '';
  $('pm25').textContent = r.pm25;
  $('pm25-band').textContent = ev.pm25Band.label;
  $('trend').textContent = ev.trend ? `Trend: ${ARROW[ev.trend]}` : '';
  spark(r.series);
  $('psi').textContent = r.psi;
  $('psi-band').textContent = ev.psiBand.label;
  const s = r.sub;
  $('psi-sub').textContent = [s.pm25_24h != null && `PM2.5 sub-index ${s.pm25_24h}`, s.o3 != null && `O₃ sub-index ${s.o3}`]
    .filter(Boolean)
    .join(' · ');
  $('adv-action').textContent = r.advice.action;
  $('adv-outdoor').textContent = r.advice.outdoor.slice(r.advice.action.length).trim();
  $('adv-risk').textContent = r.advice.higherRisk || '';
  renderGuide(ev.level.id);
  $('adv-purifier').textContent = r.advice.purifier;
  $('adv-aircon').textContent = r.advice.aircon;
  $('updated').textContent = `PM2.5 reading ${r.pm25At || '?'} · checked ${new Date().toLocaleTimeString()}`;
  $('disclaimer').textContent = DISCLAIMER;
}

async function refresh() {
  if (!postal) return;
  try {
    const report = await loadReport(await resolveHome());
    render(report);
    loadHistory(report.region, { cache: store })
      .then((hist) => renderHistory(hist, report))
      .catch(() => ($('history').hidden = true));
  } catch (e) {
    const v = $('verdict');
    v.classList.add('error');
    v.style.background = '';
    $('verdict-label').textContent = 'Could not load data';
    $('verdict-note').textContent = `${e.message}. Retrying in 10 minutes.`;
  }
}

if (postal) {
  refresh();
} else {
  askPostal();
}
setInterval(refresh, REFRESH_MS);
document.addEventListener('visibilitychange', () => !document.hidden && refresh());

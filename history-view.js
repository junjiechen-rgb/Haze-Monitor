// Renders the hourly PM2.5 chart and the outdoor-window card.
import { LEVELS, pm25Band } from './lib/advice.js';
import { BAND1_MAX, fmtHour, fmtWindow, hourlyProfile, last24h, recommendWindows, sgtParts } from './lib/windows.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, text) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};

const X0 = 26, X1 = 316, Y0 = 10, Y1 = 116;

function drawChart(slots, profile) {
  const svg = $('hourly');
  svg.replaceChildren();
  const vals = slots.map((s) => s.value).filter((v) => v != null);
  const typs = slots.map((s) => profile.hours[s.hour].median).filter((v) => v != null);
  const max = Math.max(10, ...vals, ...typs) * 1.15;
  const y = (v) => Y1 - (v / max) * (Y1 - Y0);
  const step = (X1 - X0) / slots.length;
  const bw = step * 0.72;

  // gridlines + y labels
  const tick = max > 120 ? 50 : max > 50 ? 20 : max > 20 ? 10 : 5;
  for (let v = 0; v <= max; v += tick) {
    svg.append(el('line', { x1: X0, x2: X1, y1: y(v), y2: y(v), class: 'grid-line' }));
    svg.append(el('text', { x: X0 - 4, y: y(v) + 3, 'text-anchor': 'end', class: 'ax' }, v));
  }
  if (max >= BAND1_MAX) {
    svg.append(el('line', { x1: X0, x2: X1, y1: y(BAND1_MAX), y2: y(BAND1_MAX), class: 'band1' }));
    svg.append(el('text', { x: X0 + 2, y: y(BAND1_MAX) - 3, class: 'band1-label' }, 'Band I limit 55'));
  }

  slots.forEach((s, i) => {
    const x = X0 + i * step + (step - bw) / 2;
    const typ = profile.hours[s.hour].median;
    if (s.value != null) {
      const bar = el('rect', {
        x, y: y(s.value), width: bw, height: Math.max(1, Y1 - y(s.value)), rx: 1.5,
        fill: LEVELS[pm25Band(s.value).idx].color, class: 'bar', tabindex: 0,
      });
      const label = `${fmtHour(s.hour)}: ${s.value} µg/m³ · ${pm25Band(s.value).label}${typ != null ? ` · usual ${Math.round(typ)}` : ''}`;
      bar.append(el('title', {}, label));
      const pick = () => {
        svg.querySelectorAll('.sel').forEach((n) => n.classList.remove('sel'));
        bar.classList.add('sel');
        $('hourly-pick').textContent = label;
      };
      bar.addEventListener('click', pick);
      bar.addEventListener('focus', pick);
      svg.append(bar);
    }
    if (typ != null) svg.append(el('line', { x1: x - 1, x2: x + bw + 1, y1: y(typ), y2: y(typ), class: 'typ' }));
    const last = i === slots.length - 1;
    if (last || (s.hour % 3 === 0 && i < slots.length - 2)) {
      svg.append(el('text', { x: x + bw / 2, y: Y1 + 12, 'text-anchor': 'middle', class: last ? 'now' : 'ax' }, last ? 'now' : fmtHour(s.hour)));
    }
  });

  const have = slots.filter((s) => s.value != null);
  if (!have.length) return ($('hourly-summary').textContent = 'No hourly readings yet.');
  const hi = have.reduce((a, b) => (b.value > a.value ? b : a));
  const lo = have.reduce((a, b) => (b.value < a.value ? b : a));
  const cur = have.at(-1);
  const typNow = profile.hours[cur.hour].median;
  const vsUsual =
    typNow == null ? '' : cur.value > typNow * 1.3 + 3 ? ' Higher than usual for this hour.' : cur.value < typNow * 0.7 - 3 ? ' Lower than usual for this hour.' : ' About usual for this hour.';
  $('hourly-summary').textContent = `Peak ${hi.value} at ${fmtHour(hi.hour)}, lowest ${lo.value} at ${fmtHour(lo.hour)}.${vsUsual}`;
  $('hourly').setAttribute('aria-label', `Hourly PM2.5, last 24 hours. ${$('hourly-summary').textContent}`);
}

function drawWindows(rec, nowHour) {
  const chips = $('windows');
  const strip = $('strip');
  const note = $('windows-note');
  chips.replaceChildren();
  strip.replaceChildren();
  const chip = (text, cls = '') => {
    const c = document.createElement('span');
    c.className = `chip ${cls}`;
    c.textContent = text;
    chips.append(c);
  };

  if (rec.insufficient) {
    chip('Not enough history yet', 'alt');
    note.textContent = `Needs at least 3 days of hourly records (have ${rec.days}).`;
    return;
  }
  const t = rec.today;
  if (t?.windows.length) t.windows.forEach((w, i) => chip(`Today ${fmtWindow(w)}`, i ? 'alt' : ''));
  else if (t?.noneReason) chip(`No good window left today, check again at ${fmtHour(t.checkAgain)}`, 'warn');
  else if (t) chip('No clearly cleaner hours left today; air is similar all evening', 'alt');
  if (!t || !t.windows.length) rec.tomorrow.windows.forEach((w) => chip(`Tomorrow ${fmtWindow(w)}`, 'alt'));

  const status = new Map((t ?? rec.tomorrow).slots.map((s) => [s.hour, s]));
  for (let h = 6; h < 22; h++) {
    const d = document.createElement('div');
    const s = status.get(h);
    d.className = t && h <= nowHour ? 'past' : s ? s.status : 'na';
    d.textContent = (h % 12 || 12) + (h === 6 || h === 12 || h === 18 ? (h < 12 ? 'a' : 'p') : '');
    d.title = s ? `${fmtHour(h)}: est. ${Math.round(s.est)} µg/m³ (usual ${Math.round(s.typical)}) – ${s.status}` : fmtHour(h);
    strip.append(d);
  }
  const label = t ? 'Today, 6am–10pm' : 'Tomorrow, 6am–10pm (usual pattern)';
  const dev =
    t && Math.abs(rec.offset) >= 5
      ? ` Right now PM2.5 is ${Math.round(Math.abs(rec.offset))} µg/m³ ${rec.offset > 0 ? 'above' : 'below'} usual, which is factored into the next few hours.`
      : '';
  note.textContent =
    `${label}: green = cleanest hours, orange = avoid. Based on the usual hourly pattern over the last ${rec.days} days, not a forecast.${dev} ` +
    'Midday heat is not scored; for hard exercise prefer early morning or evening.';
}

export function renderHistory(hist, report, now = new Date()) {
  const profile = hourlyProfile(hist.readings, hist.today);
  const slots = last24h(hist.readings, now);
  const nowHour = sgtParts(now).hour;
  $('hist-days').textContent = profile.days;
  drawChart(slots, profile);
  drawWindows(recommendWindows({ profile, nowHour, latest: report.pm25 }), nowHour);
  $('history').hidden = false;
}

// Hourly PM2.5 history: typical daily profile and outdoor-window suggestions.
// Pattern-based (last N days), not a forecast.
import { pm25Band } from './advice.js';

export const BAND1_MAX = 55;
// How fast today's deviation from normal fades per hour. Slow on purpose:
// haze episodes persist, so a dirty hour now should not promise a clean evening.
const DECAY = 0.9;

export function sgtParts(ts) {
  const d = new Date(new Date(ts).getTime() + 8 * 3600e3);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

export const fmtHour = (h) => {
  const x = ((h % 24) + 24) % 24;
  return `${x % 12 || 12}${x < 12 ? 'am' : 'pm'}`;
};

const median = (a) => quantile(a, 0.5);
function quantile(a, q) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
}

// readings: [{date, hour, value}] in SGT. Uses past days only (not `today`).
export function hourlyProfile(readings, today) {
  const byHour = Array.from({ length: 24 }, () => []);
  const days = new Set();
  for (const r of readings) {
    if (r.date === today) continue;
    byHour[r.hour].push(r.value);
    days.add(r.date);
  }
  return {
    days: days.size,
    hours: byHour.map((v, hour) => ({ hour, median: median(v), p80: quantile(v, 0.8), n: v.length })),
  };
}

// The 24 hourly slots ending at the current SGT hour (oldest first).
export function last24h(readings, now = new Date()) {
  const map = new Map(readings.map((r) => [`${r.date}T${r.hour}`, r.value]));
  const out = [];
  for (let i = 23; i >= 0; i--) {
    const { date, hour } = sgtParts(now.getTime() - i * 3600e3);
    out.push({ date, hour, value: map.get(`${date}T${hour}`) ?? null });
  }
  return out;
}

// Best contiguous runs of `best` hours, ranked by mean estimate.
function runsOf(slots, minLen) {
  const runs = [];
  let cur = [];
  const flush = () => {
    if (cur.length >= minLen) runs.push(cur);
    cur = [];
  };
  for (const s of slots) {
    if (s.status === 'best' && (!cur.length || s.hour === cur.at(-1).hour + 1)) cur.push(s);
    else {
      flush();
      if (s.status === 'best') cur = [s];
    }
  }
  flush();
  return runs
    .map((r) => ({ start: r[0].hour, end: r.at(-1).hour + 1, mean: r.reduce((a, s) => a + s.est, 0) / r.length }))
    .sort((a, b) => a.mean - b.mean);
}

function classify(slots) {
  const ests = slots.map((s) => s.est).sort((a, b) => a - b);
  const lowCut = quantile(ests, 1 / 3);
  const highCut = quantile(ests, 2 / 3);
  for (const s of slots) {
    if (s.est > BAND1_MAX) s.status = 'avoid';
    else if (s.est <= lowCut) s.status = 'best';
    else if (s.est > highCut && highCut - lowCut >= 3) s.status = 'avoid';
    else s.status = 'ok';
  }
  return slots;
}

function plan(profile, hours, estOf, minLen) {
  const slots = classify(
    hours
      .filter((h) => profile.hours[h].median != null)
      .map((h) => ({ hour: h, est: Math.max(0, estOf(h)), typical: profile.hours[h].median })),
  );
  return { slots, windows: runsOf(slots, minLen).slice(0, 2) };
}

// nowHour: current SGT hour; latest: latest 1-hr PM2.5.
export function recommendWindows({ profile, nowHour, latest, activeHours = [6, 22], minLen = 2 }) {
  if (!profile || profile.days < 3) return { insufficient: true, days: profile?.days ?? 0 };
  const [from, to] = activeHours;
  const typicalNow = profile.hours[nowHour].median ?? latest;
  const offset = latest - typicalNow;
  const upcoming = [];
  for (let h = Math.max(from, nowHour + 1); h < to; h++) upcoming.push(h);

  const all = [];
  for (let h = from; h < to; h++) all.push(h);
  const tomorrow = plan(profile, all, (h) => profile.hours[h].median, minLen);

  if (upcoming.length < minLen) return { days: profile.days, today: null, tomorrow };

  const today = plan(profile, upcoming, (h) => profile.hours[h].median + offset * DECAY ** (h - nowHour), minLen);
  const hazy = pm25Band(latest).idx >= 1;
  if (!today.windows.length && today.slots.every((s) => s.est > BAND1_MAX)) {
    today.noneReason = hazy ? 'haze' : 'high';
    today.checkAgain = (nowHour + 1) % 24;
  }
  return { days: profile.days, offset, today, tomorrow };
}

export const fmtWindow = (w) => `${fmtHour(w.start)}–${fmtHour(w.end)}`;

export function describeWindows(rec) {
  if (!rec || rec.insufficient) return null;
  const t = rec.today;
  if (t?.windows.length) return `Today: ${t.windows.map(fmtWindow).join(', ')}`;
  const tm = rec.tomorrow.windows.length ? `Tomorrow (usual): ${rec.tomorrow.windows.map(fmtWindow).join(', ')}` : '';
  if (t?.noneReason) return `No good window left today; check again at ${fmtHour(t.checkAgain)}. ${tm}`.trim();
  return tm || null;
}

// Classification + advice. Advice is driven by 1-hour PM2.5 (NEA's guide for
// the next few hours); 24-hour PSI is context and can bump the level by one.

export const LEVELS = [
  { id: 0, key: 'good', label: 'Good', color: '#2e9e5b', template: 'green' },
  { id: 1, key: 'moderate', label: 'Moderate', color: '#d9a400', template: 'yellow' },
  { id: 2, key: 'unhealthy', label: 'Unhealthy', color: '#e8710a', template: 'orange' },
  { id: 3, key: 'very-unhealthy', label: 'Very Unhealthy', color: '#c5221f', template: 'red' },
];

// NEA 24-hr PSI bands -> index 0..4
export function psiBand(psi) {
  if (psi <= 50) return { idx: 0, label: 'Good' };
  if (psi <= 100) return { idx: 1, label: 'Moderate' };
  if (psi <= 200) return { idx: 2, label: 'Unhealthy' };
  if (psi <= 300) return { idx: 3, label: 'Very Unhealthy' };
  return { idx: 4, label: 'Hazardous' };
}

// NEA 1-hr PM2.5 bands (ug/m3) -> level 0..3
export function pm25Band(v) {
  if (v <= 55) return { idx: 0, label: 'Band I (Normal)' };
  if (v <= 150) return { idx: 1, label: 'Band II (Elevated)' };
  if (v <= 250) return { idx: 2, label: 'Band III (High)' };
  return { idx: 3, label: 'Band IV (Very High)' };
}

// trend: 'rising' | 'falling' | 'steady' | null
export function trendOf(series) {
  if (!series || series.length < 2) return null;
  const d = series[series.length - 1] - series[series.length - 2];
  if (d >= 5) return 'rising';
  if (d <= -5) return 'falling';
  return 'steady';
}

export function evaluate({ psi, pm25, trend = null }) {
  const pm = pm25Band(pm25);
  const ps = psiBand(psi);
  let level = pm.idx;
  let note = null;
  if (ps.idx >= 2 && ps.idx > pm.idx) {
    if (trend === 'falling') {
      note = `24h PSI is ${ps.label} from earlier haze, but the hourly PM2.5 is improving.`;
    } else {
      level = Math.min(3, level + 1);
      note = `24h PSI is ${ps.label}, higher than the current hourly PM2.5 suggests, so advice is one step more cautious.`;
    }
  }
  return { level: LEVELS[level], pm25Band: pm, psiBand: ps, trend, note };
}

const OUTDOOR = [
  'Air is fine. Normal outdoor activity, including exercise, is OK.',
  'Fine for most people. If you have asthma, heart or lung disease, or are elderly or a young child, cut back on prolonged strenuous exertion outdoors.',
  'Reduce prolonged or strenuous outdoor activity (run indoors instead). Sensitive groups should stay indoors. Wear a well-fitted N95 if you must be outside for long.',
  'Stay indoors and avoid outdoor exertion. Wear a well-fitted N95 for essential trips. Sensitive groups should avoid going out at all.',
];

const PURIFIER = [
  'Not needed. Auto or low mode is fine if you have one running.',
  'Run on auto, especially in the bedroom or if anyone is sensitive.',
  'Run on high in the room you spend time in, with doors and windows shut. Check the filter is not overdue.',
  'Run on high continuously in the main living area and bedroom, doors and windows shut. Replace the filter if it is near end of life.',
];

const AIRCON = [
  'Windows can stay open. Aircon as you normally would.',
  'Open windows only briefly. Aircon is fine, and clean the filters if they are dusty.',
  'Close windows and use aircon (no fresh-air or exhaust mode), and make sure the filters are clean. This keeps the haze out and cools the room.',
  'Keep everything sealed. Run aircon with fresh-air intake off, close gaps under doors, and avoid exhaust fans and range hoods unless needed.',
];

export function buildAdvice(ev) {
  const i = ev.level.id;
  let outdoor = OUTDOOR[i];
  if (ev.trend === 'falling' && i >= 2) outdoor += ' Air is improving, so check again in an hour before heading out.';
  if (ev.trend === 'rising' && i >= 1) outdoor += ' Levels are rising, so plan indoor options now.';
  return { outdoor, purifier: PURIFIER[i], aircon: AIRCON[i] };
}

export const DISCLAIMER =
  'General guidance based on NEA bands, not medical advice. Sensitive groups: children, elderly, pregnant, and people with asthma, heart or lung conditions.';

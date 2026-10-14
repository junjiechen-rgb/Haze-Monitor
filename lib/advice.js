// Classification + advice. Follows NEA's 1-hour PM2.5 guide exactly; the
// 24-hour PSI is shown as context only and never changes the band.

export const LEVELS = [
  { id: 0, key: 'normal', band: 'I', label: 'Normal', range: '0–55', color: '#2e9e5b', template: 'green' },
  { id: 1, key: 'elevated', band: 'II', label: 'Elevated', range: '56–150', color: '#d9a400', template: 'yellow' },
  { id: 2, key: 'high', band: 'III', label: 'High', range: '151–250', color: '#e8710a', template: 'orange' },
  { id: 3, key: 'very-high', band: 'IV', label: 'Very High', range: '≥251', color: '#c5221f', template: 'red' },
];

// NEA "what to do" per 1-hr PM2.5 band.
export const NEA_ACTION = [
  'Continue normal activities.',
  'Reduce prolonged or strenuous outdoor activity.',
  'Avoid prolonged or strenuous outdoor activity.',
  'Minimise all outdoor activity for the next hour.',
];

export const HIGHER_RISK = 'older adults, pregnant women, children, and people with chronic lung or heart disease';

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
  const note =
    ps.idx >= 2 ? `24-hr PSI is ${ps.label} (${psi}). Advice follows the 1-hour PM2.5, as NEA recommends for what to do now.` : null;
  return { level: LEVELS[pm.idx], pm25Band: pm, psiBand: ps, trend, note };
}

// Practical detail after NEA's action.
const OUTDOOR_DETAIL = [
  'Outdoor exercise is fine.',
  'For example, shorten a long run or move a hard workout indoors.',
  'Move exercise indoors and keep outdoor time short. A well-fitted N95 helps if you must be out for long.',
  'Stay indoors where you can; wear a well-fitted N95 for essential trips.',
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
  let outdoor = `${NEA_ACTION[i]} ${OUTDOOR_DETAIL[i]}`;
  if (ev.trend === 'falling' && i >= 2) outdoor += ' Air is improving, so check again in an hour before heading out.';
  if (ev.trend === 'rising' && i >= 1) outdoor += ' Levels are rising, so plan indoor options now.';
  const higherRisk =
    i >= 1 ? `Higher-risk groups (${HIGHER_RISK}) should take extra precautions: limit time outdoors and avoid exertion.` : null;
  return { action: NEA_ACTION[i], outdoor, higherRisk, purifier: PURIFIER[i], aircon: AIRCON[i] };
}

export const DISCLAIMER =
  `Based on NEA's 1-hour PM2.5 guide; not medical advice. Higher-risk groups: ${HIGHER_RISK}.`;

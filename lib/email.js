// Email version of the alert (plain text + simple HTML).
import { DISCLAIMER } from './advice.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ARROW = { rising: '↑ rising', falling: '↓ falling', steady: '→ steady' };

export function buildEmail(report, { kind = 'alert', dashboardUrl } = {}) {
  const { eval: ev, advice: a } = report;
  const prefix = kind === 'daily' ? 'Daily haze summary' : kind === 'test' ? 'Test: haze monitor' : 'Haze alert';
  const subject = `${prefix}: ${ev.level.label} (Band ${ev.level.band}), PM2.5 ${report.pm25}`;
  const rows = [
    ['PM2.5 (1-hr)', `${report.pm25} µg/m³ · ${ev.pm25Band.label}${ev.trend ? ` · ${ARROW[ev.trend]}` : ''}`],
    ['PSI (24-hr)', `${report.psi} · ${ev.psiBand.label}`],
    ['Nearest point', `${report.region} region, ${report.distanceKm.toFixed(1)} km away`],
    ...(report.windowsText ? [['Best outdoor window', report.windowsText]] : []),
  ];
  const advice = [
    ['Outdoor', a.outdoor + (a.higherRisk ? ` ${a.higherRisk}` : '')],
    ['Air purifier', a.purifier],
    ['Air-con', a.aircon],
  ];
  const text = [
    subject,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(ev.note ? ['', ev.note] : []),
    '',
    ...advice.map(([k, v]) => `${k}: ${v}`),
    '',
    DISCLAIMER,
    ...(dashboardUrl ? [`Dashboard: ${dashboardUrl}`] : []),
  ].join('\n');
  const tr = ([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#667085;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;color:#1c1f24">
<div style="background:${ev.level.color};color:${ev.level.id === 1 ? '#1c1f24' : '#fff'};padding:14px 16px;border-radius:10px;font-size:20px;font-weight:700">${esc(ev.level.label)} (Band ${ev.level.band})</div>
<table style="margin:12px 0;font-size:14px;border-collapse:collapse">${rows.map(tr).join('')}</table>
${ev.note ? `<p style="font-size:13px;color:#667085">${esc(ev.note)}</p>` : ''}
<table style="margin:12px 0;font-size:14px;border-collapse:collapse">${advice.map(tr).join('')}</table>
<p style="font-size:12px;color:#667085">${esc(DISCLAIMER)}${dashboardUrl ? `<br><a href="${esc(dashboardUrl)}">Open dashboard</a>` : ''}</p>
</div>`;
  return { subject, text, html };
}

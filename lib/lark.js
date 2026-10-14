// Lark custom-bot helpers (international Lark and Feishu webhooks both work).
import { createHmac } from 'node:crypto';
import { DISCLAIMER } from './advice.js';

// timestamp in seconds; key is `${timestamp}\n${secret}`, message empty.
export function signLark(timestamp, secret) {
  return createHmac('sha256', `${timestamp}\n${secret}`).update('').digest('base64');
}

const ARROW = { rising: '↑ rising', falling: '↓ falling', steady: '→ steady' };

export function buildCard(report, { kind = 'alert' } = {}) {
  const { eval: ev, advice: a } = report;
  const title = `${kind === 'daily' ? 'Daily haze summary' : kind === 'test' ? 'Test: haze monitor' : 'Haze alert'}: ${ev.level.label}`;
  const facts =
    `**PM2.5 (1-hr):** ${report.pm25} µg/m³ · ${ev.pm25Band.label}${ev.trend ? ` · ${ARROW[ev.trend]}` : ''}\n` +
    `**PSI (24-hr):** ${report.psi} · ${ev.psiBand.label}\n` +
    `**Nearest point:** ${report.region} region, ${report.distanceKm.toFixed(1)} km from ${report.home.postal}`;
  const elements = [
    { tag: 'div', text: { tag: 'lark_md', content: facts } },
    ...(ev.note ? [{ tag: 'note', elements: [{ tag: 'plain_text', content: ev.note }] }] : []),
    { tag: 'hr' },
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**Outdoor:** ${a.outdoor}\n\n**Air purifier:** ${a.purifier}\n\n**Air-con:** ${a.aircon}`,
      },
    },
    { tag: 'note', elements: [{ tag: 'plain_text', content: DISCLAIMER }] },
  ];
  return {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: { title: { tag: 'plain_text', content: title }, template: ev.level.template },
      elements,
    },
  };
}

// state = {level, dailyDate} from the previous run (or null).
// Returns 'alert' | 'daily' | null.
export function decideNotify({ state, level, nowSGT }) {
  const date = new Date(nowSGT.getTime() + 8 * 3600e3);
  const day = date.toISOString().slice(0, 10);
  const hour = date.getUTCHours();
  if (state && state.level !== level) return 'alert';
  if (!state && level >= 1) return 'alert';
  if (hour >= 7 && state?.dailyDate !== day) return 'daily';
  return null;
}

export async function sendLark(webhook, card, secret, f = fetch) {
  const body = { ...card };
  if (secret) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    body.timestamp = timestamp;
    body.sign = signLark(timestamp, secret);
  }
  const res = await f(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  const code = json.code ?? json.StatusCode ?? 0;
  if (!res.ok || code !== 0) throw new Error(`Lark send failed: HTTP ${res.status} ${JSON.stringify(json)}`);
  return json;
}

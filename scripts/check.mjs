// Hourly check: fetch nearest PSI/PM2.5, send a Lark card when worthwhile.
// Env: LARK_WEBHOOK_URL (required), LARK_SIGN_SECRET, HAZE_POSTAL (your postal code, required).
// Flags: --test (always send), --dry (print card, don't send).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { geocodePostal } from '../lib/geo.js';
import { loadReport } from '../lib/data.js';
import { buildCard, decideNotify, sendLark } from '../lib/lark.js';

const STATE = '.state/last.json';
const args = new Set(process.argv.slice(2));
const postal = process.env.HAZE_POSTAL;
if (!postal) throw new Error('HAZE_POSTAL is not set (repo variable or env)');

const home = await geocodePostal(postal);

const report = await loadReport(home);
const state = await readFile(STATE, 'utf8').then(JSON.parse).catch(() => null);
const kind = args.has('--test') ? 'test' : decideNotify({ state, level: report.eval.level.id, nowSGT: new Date() });
console.log(`PM2.5 ${report.pm25}, PSI ${report.psi}, ${report.region}, level ${report.eval.level.label}, notify=${kind}`);

if (kind) {
  const card = buildCard(report, { kind });
  if (args.has('--dry')) console.log(JSON.stringify(card, null, 2));
  else {
    const hook = process.env.LARK_WEBHOOK_URL;
    if (!hook) throw new Error('LARK_WEBHOOK_URL is not set');
    await sendLark(hook, card, process.env.LARK_SIGN_SECRET);
    console.log('Lark message sent');
  }
}

if (!args.has('--test')) {
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  await mkdir('.state', { recursive: true });
  await writeFile(
    STATE,
    JSON.stringify({ level: report.eval.level.id, dailyDate: kind === 'daily' ? today : state?.dailyDate ?? null }),
  );
}

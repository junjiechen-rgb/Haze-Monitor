// Hourly check: fetch nearest PSI/PM2.5 and alert every configured recipient
// (Lark webhooks and/or email) when worthwhile.
// Env: HAZE_POSTAL (required); recipients, see lib/notify.js; DASHBOARD_URL (optional).
// Flags: --test (always send), --dry (print messages, don't send).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { geocodePostal } from '../lib/geo.js';
import { loadHistory, loadReport } from '../lib/data.js';
import { describeWindows, hourlyProfile, recommendWindows, sgtParts } from '../lib/windows.js';
import { buildCard, decideNotify } from '../lib/lark.js';
import { buildEmail } from '../lib/email.js';
import { notifyAll, recipientsFromEnv } from '../lib/notify.js';

const STATE = '.state/last.json';
const args = new Set(process.argv.slice(2));
const postal = process.env.HAZE_POSTAL;
if (!postal) throw new Error('HAZE_POSTAL is not set (repo variable or env)');

const home = await geocodePostal(postal);

const report = await loadReport(home);
try {
  const hist = await loadHistory(report.region);
  const rec = recommendWindows({
    profile: hourlyProfile(hist.readings, hist.today),
    nowHour: sgtParts(new Date()).hour,
    latest: report.pm25,
  });
  report.windowsText = describeWindows(rec);
} catch (e) {
  console.warn(`history unavailable: ${e.message}`);
}
const state = await readFile(STATE, 'utf8').then(JSON.parse).catch(() => null);
const kind = args.has('--test') ? 'test' : decideNotify({ state, level: report.eval.level.id, nowSGT: new Date() });
console.log(`PM2.5 ${report.pm25}, PSI ${report.psi}, ${report.region}, level ${report.eval.level.label}, notify=${kind}`);

const repo = process.env.GITHUB_REPOSITORY;
const dashboardUrl =
  process.env.DASHBOARD_URL || (repo ? `https://${repo.split('/')[0].toLowerCase()}.github.io/${repo.split('/')[1]}/` : undefined);
let failed = 0;

if (kind) {
  if (args.has('--dry')) {
    console.log(JSON.stringify(buildCard(report, { kind, dashboardUrl }), null, 2));
    console.log(buildEmail(report, { kind, dashboardUrl }).text);
  } else {
    const recipients = recipientsFromEnv(process.env);
    if (!recipients.lark.length && !recipients.emails.length) {
      console.warn('No recipients configured (LARK_WEBHOOK_URLS / ALERT_EMAILS); nothing sent.');
    }
    for (const r of await notifyAll(report, kind, recipients, { dashboardUrl })) {
      console.log(`${r.ok ? 'sent' : 'FAILED'} ${r.channel} → ${r.to}${r.error ? `: ${r.error}` : ''}`);
      if (!r.ok) failed++;
    }
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

if (failed) {
  console.error(`${failed} delivery(s) failed`);
  process.exitCode = 1;
}

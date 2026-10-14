// Fan an alert out to every configured Lark webhook and email address.
import { buildCard, sendLark } from './lark.js';
import { buildEmail } from './email.js';

const split = (s) => (s || '').split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);

// Env:
//   LARK_WEBHOOK_URLS  one per line (or comma separated); "url|signSecret" for signed bots
//   LARK_WEBHOOK_URL / LARK_SIGN_SECRET  single-bot form, still supported
//   ALERT_EMAILS       one per line (or comma separated)
//   GMAIL_USER, GMAIL_APP_PASSWORD  sender account (Gmail app password)
export function recipientsFromEnv(env) {
  const lark = split(env.LARK_WEBHOOK_URLS).map((e) => {
    const [url, secret] = e.split('|').map((x) => x.trim());
    return { url, secret: secret || undefined };
  });
  if (env.LARK_WEBHOOK_URL) lark.push({ url: env.LARK_WEBHOOK_URL.trim(), secret: env.LARK_SIGN_SECRET || undefined });
  const seen = new Set();
  const larkUnique = lark.filter((l) => l.url && !seen.has(l.url) && seen.add(l.url));
  const emails = [...new Set(split(env.ALERT_EMAILS))];
  const smtp = env.GMAIL_USER && env.GMAIL_APP_PASSWORD ? { user: env.GMAIL_USER.trim(), pass: env.GMAIL_APP_PASSWORD.replace(/\s+/g, '') } : null;
  return { lark: larkUnique, emails, smtp };
}

// Masks for logs: never print full webhook URLs or addresses.
export const maskUrl = (u) => u.replace(/(hook\/)([^/?]{4})[^/?]*/, '$1$2…');
export const maskEmail = (e) => e.replace(/^(.)[^@]*/, '$1…');

async function gmailTransport(smtp) {
  const { default: nodemailer } = await import('nodemailer');
  return nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: smtp });
}

// Returns [{channel, to, ok, error?}]. Each recipient is tried independently.
export async function notifyAll(report, kind, recipients, { dashboardUrl, transport, f = fetch } = {}) {
  const results = [];
  const card = buildCard(report, { kind, dashboardUrl });
  for (const l of recipients.lark) {
    try {
      await sendLark(l.url, card, l.secret, f);
      results.push({ channel: 'lark', to: maskUrl(l.url), ok: true });
    } catch (e) {
      results.push({ channel: 'lark', to: maskUrl(l.url), ok: false, error: e.message });
    }
  }
  if (recipients.emails.length) {
    if (!recipients.smtp) {
      results.push({ channel: 'email', to: 'all', ok: false, error: 'GMAIL_USER / GMAIL_APP_PASSWORD not set' });
    } else {
      const mail = buildEmail(report, { kind, dashboardUrl });
      const tx = transport ?? (await gmailTransport(recipients.smtp));
      for (const to of recipients.emails) {
        try {
          // One message per recipient so addresses are not shared.
          await tx.sendMail({ from: `Haze Monitor <${recipients.smtp.user}>`, to, ...mail });
          results.push({ channel: 'email', to: maskEmail(to), ok: true });
        } catch (e) {
          results.push({ channel: 'email', to: maskEmail(to), ok: false, error: e.message });
        }
      }
    }
  }
  return results;
}

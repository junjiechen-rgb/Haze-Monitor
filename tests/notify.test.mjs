import test from 'node:test';
import assert from 'node:assert/strict';
import { recipientsFromEnv, notifyAll, maskUrl, maskEmail } from '../lib/notify.js';
import { buildEmail } from '../lib/email.js';
import { buildReport } from '../lib/data.js';
import * as fx from './fixtures.mjs';

const HOME = { postal: 'test', lat: 1.3048, lng: 103.8318 };
const report = () => {
  const r = buildReport({ home: HOME, pm25Json: fx.pm25([90, 100]), psiJson: fx.psi(60) });
  r.windowsText = 'Today: 7pm–10pm';
  return r;
};
const H1 = 'https://open.larksuite.com/open-apis/bot/v2/hook/aaaa1111';
const H2 = 'https://open.feishu.cn/open-apis/bot/v2/hook/bbbb2222';

test('parses multiple Lark webhooks, signing secrets, emails; dedupes', () => {
  const r = recipientsFromEnv({
    LARK_WEBHOOK_URLS: `${H1}\n${H2} | s3cret\n`,
    LARK_WEBHOOK_URL: H1,
    ALERT_EMAILS: 'a@x.com, b@y.com\na@x.com',
    GMAIL_USER: 'me@gmail.com',
    GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop',
  });
  assert.deepEqual(r.lark, [{ url: H1, secret: undefined }, { url: H2, secret: 's3cret' }]);
  assert.deepEqual(r.emails, ['a@x.com', 'b@y.com']);
  assert.equal(r.smtp.pass, 'abcdefghijklmnop');
});

test('legacy single webhook still works; no smtp without both creds', () => {
  const r = recipientsFromEnv({ LARK_WEBHOOK_URL: H1, LARK_SIGN_SECRET: 'k', GMAIL_USER: 'me@gmail.com' });
  assert.deepEqual(r.lark, [{ url: H1, secret: 'k' }]);
  assert.equal(r.smtp, null);
});

test('masks secrets in logs', () => {
  assert.equal(maskUrl(H1), 'https://open.larksuite.com/open-apis/bot/v2/hook/aaaa…');
  assert.equal(maskEmail('alice@x.com'), 'a…@x.com');
});

test('sends to every recipient independently; one failure does not stop others', async () => {
  const posted = [];
  const f = async (url, init) => {
    posted.push({ url, body: JSON.parse(init.body) });
    const bad = url === H2;
    return { ok: true, status: 200, json: async () => (bad ? { code: 19021, msg: 'sign match fail' } : { code: 0 }) };
  };
  const mails = [];
  const transport = { sendMail: async (m) => { if (m.to === 'bad@x.com') throw new Error('550 no such user'); mails.push(m); } };
  const recipients = {
    lark: [{ url: H1 }, { url: H2, secret: 's' }],
    emails: ['a@x.com', 'bad@x.com', 'b@y.com'],
    smtp: { user: 'me@gmail.com', pass: 'p' },
  };
  const res = await notifyAll(report(), 'alert', recipients, { f, transport, dashboardUrl: 'https://u.github.io/Haze-Monitor/' });
  assert.deepEqual(res.map((r) => [r.channel, r.ok]), [['lark', true], ['lark', false], ['email', true], ['email', false], ['email', true]]);
  assert.ok(posted[1].body.sign && posted[1].body.timestamp);
  assert.equal(posted[0].body.sign, undefined);
  assert.deepEqual(mails.map((m) => m.to), ['a@x.com', 'b@y.com']);
  assert.match(mails[0].from, /me@gmail\.com/);
  assert.ok(JSON.stringify(posted[0].body).includes('Open dashboard'));
});

test('emails without Gmail credentials are reported as failed', async () => {
  const res = await notifyAll(report(), 'test', { lark: [], emails: ['a@x.com'], smtp: null });
  assert.equal(res[0].ok, false);
  assert.match(res[0].error, /GMAIL_APP_PASSWORD/);
});

test('email content: subject, NEA advice, window, escaping', () => {
  const r = report();
  r.windowsText = 'Today: <7pm>';
  const m = buildEmail(r, { kind: 'daily', dashboardUrl: 'https://u.github.io/x/' });
  assert.match(m.subject, /^Daily haze summary: Elevated \(Band II\), PM2\.5 100$/);
  assert.match(m.text, /Reduce prolonged or strenuous outdoor activity/);
  assert.match(m.text, /Higher-risk groups/);
  assert.ok(m.html.includes('Today: &lt;7pm&gt;'));
  assert.ok(m.html.includes('href="https://u.github.io/x/"'));
});

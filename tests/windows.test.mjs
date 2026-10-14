import test from 'node:test';
import assert from 'node:assert/strict';
import { hourlyProfile, last24h, recommendWindows, describeWindows, fmtWindow, sgtParts } from '../lib/windows.js';
import { loadHistory, readingsFor } from '../lib/data.js';
import { buildCard } from '../lib/lark.js';
import { buildReport } from '../lib/data.js';
import * as fx from './fixtures.mjs';

const PAST = ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'];
const TODAY = '2026-10-14';
const profile = hourlyProfile(fx.readingsDays([...PAST, TODAY], (h) => fx.pattern(h)), TODAY);

test('profile uses past days only and gives per-hour medians', () => {
  assert.equal(profile.days, 7);
  assert.equal(profile.hours[7].median, 8);
  assert.equal(profile.hours[14].median, 40);
});

test('sgtParts converts to Singapore time', () => {
  assert.deepEqual(sgtParts('2026-10-13T23:30:00Z'), { date: '2026-10-14', hour: 7 });
});

test('morning: today windows are early morning, never the dirty afternoon', () => {
  const rec = recommendWindows({ profile, nowHour: 5, latest: 15 });
  const w = rec.today.windows;
  assert.ok(w.length >= 1);
  assert.equal(fmtWindow(w[0]), '6am–9am');
  for (const s of rec.today.slots) if (s.hour >= 13 && s.hour < 17) assert.equal(s.status, 'avoid');
});

test('afternoon: past hours excluded, evening recommended', () => {
  const rec = recommendWindows({ profile, nowHour: 14, latest: 40 });
  assert.ok(rec.today.slots.every((s) => s.hour > 14));
  assert.equal(fmtWindow(rec.today.windows[0]), '7pm–10pm');
});

test('haze today suppresses windows and says when to check again', () => {
  const rec = recommendWindows({ profile, nowHour: 10, latest: 180 });
  assert.equal(rec.today.windows.length, 0);
  assert.equal(rec.today.noneReason, 'haze');
  assert.match(describeWindows(rec), /check again at 11am/);
});

test('late night falls back to tomorrow\'s usual pattern', () => {
  const rec = recommendWindows({ profile, nowHour: 21, latest: 10 });
  assert.equal(rec.today, null);
  assert.match(describeWindows(rec), /^Tomorrow \(usual\): 6am–9am/);
});

test('fewer than 3 days of history hides the recommendation', () => {
  const p = hourlyProfile(fx.readingsDays(['2026-10-12', '2026-10-13']), TODAY);
  assert.equal(recommendWindows({ profile: p, nowHour: 5, latest: 10 }).insufficient, true);
  assert.equal(describeWindows({ insufficient: true }), null);
});

test('last24h returns 24 SGT slots ending now, with gaps as null', () => {
  const now = new Date('2026-10-14T02:20:00Z'); // 10:20 SGT
  const s = last24h(fx.readingsDays([TODAY]).filter((r) => r.hour <= 9), now);
  assert.equal(s.length, 24);
  assert.deepEqual([s.at(-1).date, s.at(-1).hour], [TODAY, 10]);
  assert.equal(s.at(-1).value, null);
  assert.equal(s.at(-2).value, fx.pattern(9));
});

test('readingsFor extracts region values by SGT hour', () => {
  const r = readingsFor(fx.pm25Day(TODAY).data.items, 'south');
  assert.equal(r.length, 24);
  assert.deepEqual(r[7], { date: TODAY, hour: 7, value: 8 });
});

test('loadHistory fetches each day, follows pagination and caches past days', async () => {
  const now = new Date('2026-10-14T04:00:00Z');
  const calls = [];
  const f = async (url) => {
    calls.push(url);
    const date = new URL(url).searchParams.get('date');
    const day = fx.pm25Day(date);
    if (date === '2026-10-13' && !url.includes('paginationToken')) {
      day.data.items = day.data.items.slice(0, 12);
      day.data.paginationToken = 'p2';
    } else if (url.includes('paginationToken')) {
      day.data.items = day.data.items.slice(12);
    }
    return { ok: true, json: async () => day };
  };
  const mem = new Map();
  const cache = { get: (k) => mem.get(k) ?? null, set: (k, v) => mem.set(k, v) };
  const h = await loadHistory('south', { days: 7, f, cache, now });
  assert.equal(h.today, TODAY);
  assert.equal(hourlyProfile(h.readings, h.today).days, 7);
  assert.ok(calls.some((u) => u.includes('paginationToken=p2')));
  assert.equal(h.readings.filter((r) => r.date === '2026-10-13').length, 24);
  calls.length = 0;
  await loadHistory('south', { days: 7, f, cache, now });
  assert.deepEqual(calls.map((u) => new URL(u).searchParams.get('date')), [TODAY]);
});

test('loadHistory tolerates failed days', async () => {
  const f = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const h = await loadHistory('south', { days: 3, f, now: new Date('2026-10-14T04:00:00Z') });
  assert.deepEqual(h.readings, []);
});

test('Lark card includes the outdoor window and no postal code', () => {
  const r = buildReport({ home: { postal: '999999', lat: 1.3, lng: 103.83 }, pm25Json: fx.pm25([10]), psiJson: fx.psi(40) });
  r.windowsText = 'Today: 7pm–10pm';
  const text = JSON.stringify(buildCard(r));
  assert.ok(text.includes('Best outdoor window'));
  assert.ok(!text.includes('999999'));
});

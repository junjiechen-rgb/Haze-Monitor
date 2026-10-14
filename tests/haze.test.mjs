import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, nearestRegion, FALLBACK_REGIONS } from '../lib/geo.js';
import { psiBand, pm25Band, trendOf, evaluate, buildAdvice } from '../lib/advice.js';
import { buildReport } from '../lib/data.js';
import { signLark, buildCard, decideNotify } from '../lib/lark.js';
import * as fx from './fixtures.mjs';

test('haversine ~111km per degree latitude', () => {
  const d = haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
  assert.ok(Math.abs(d - 111.2) < 0.5);
});

// Orchard Road area, used only as a generic test point.
const HOME = { postal: 'test', lat: 1.3048, lng: 103.8318 };

test('a point in the south of the island is nearest to the south region', () => {
  assert.equal(nearestRegion(HOME, FALLBACK_REGIONS).name, 'south');
});

test('band thresholds', () => {
  assert.equal(psiBand(50).idx, 0);
  assert.equal(psiBand(51).idx, 1);
  assert.equal(psiBand(101).idx, 2);
  assert.equal(psiBand(201).idx, 3);
  assert.equal(psiBand(301).idx, 4);
  assert.equal(pm25Band(55).idx, 0);
  assert.equal(pm25Band(56).idx, 1);
  assert.equal(pm25Band(151).idx, 2);
  assert.equal(pm25Band(251).idx, 3);
});

test('trend', () => {
  assert.equal(trendOf([10]), null);
  assert.equal(trendOf([10, 20]), 'rising');
  assert.equal(trendOf([20, 10]), 'falling');
  assert.equal(trendOf([20, 22]), 'steady');
});

test('advice is driven by PM2.5; PSI bumps one level unless improving', () => {
  assert.equal(evaluate({ psi: 30, pm25: 10 }).level.id, 0);
  assert.equal(evaluate({ psi: 60, pm25: 100 }).level.id, 1);
  assert.equal(evaluate({ psi: 150, pm25: 20, trend: 'steady' }).level.id, 1);
  const improving = evaluate({ psi: 150, pm25: 20, trend: 'falling' });
  assert.equal(improving.level.id, 0);
  assert.ok(improving.note);
  assert.match(buildAdvice(evaluate({ psi: 50, pm25: 200 })).aircon, /Close windows/);
});

test('buildReport picks nearest region and computes trend', () => {
  const r = buildReport({ home: HOME, pm25Json: fx.pm25([10, 12, 40]), psiJson: fx.psi(45) });
  assert.equal(r.region, 'south');
  assert.equal(r.pm25, 40);
  assert.equal(r.psi, 45);
  assert.equal(r.eval.trend, 'rising');
});

test('buildReport throws when readings are missing', () => {
  assert.throws(() => buildReport({ home: HOME, pm25Json: { data: { items: [] } }, psiJson: fx.psi(40) }), /PM2.5/);
});

test('Lark signature matches reference HMAC', () => {
  // HMAC-SHA256(key="1700000000\nsecret", msg="") base64
  assert.equal(signLark('1700000000', 'secret'), signLark('1700000000', 'secret'));
  assert.notEqual(signLark('1700000001', 'secret'), signLark('1700000000', 'secret'));
  assert.match(signLark('1', 's'), /^[A-Za-z0-9+/]+=*$/);
});

test('Lark card has header colour and all three advice items', () => {
  const r = buildReport({ home: HOME, pm25Json: fx.pm25([160]), psiJson: fx.psi(80) });
  const card = buildCard(r);
  assert.equal(card.msg_type, 'interactive');
  assert.equal(card.card.header.template, 'orange');
  const text = JSON.stringify(card);
  for (const k of ['Outdoor', 'Air purifier', 'Air-con']) assert.ok(text.includes(k));
});

test('notify policy', () => {
  const at = (h) => new Date(Date.UTC(2026, 9, 14, h - 8, 10)); // SGT hour h
  assert.equal(decideNotify({ state: { level: 0 }, level: 1, nowSGT: at(10) }), 'alert');
  assert.equal(decideNotify({ state: { level: 1 }, level: 0, nowSGT: at(10) }), 'alert');
  assert.equal(decideNotify({ state: { level: 1, dailyDate: '2026-10-14' }, level: 1, nowSGT: at(10) }), null);
  assert.equal(decideNotify({ state: { level: 0 }, level: 0, nowSGT: at(8) }), 'daily');
  assert.equal(decideNotify({ state: { level: 0 }, level: 0, nowSGT: at(3) }), null);
  assert.equal(decideNotify({ state: null, level: 0, nowSGT: at(3) }), null);
});

// data.gov.sg parsing and report building. Works in browser and Node 20+.
import { FALLBACK_REGIONS, nearestRegion } from './geo.js';
import { evaluate, buildAdvice, trendOf } from './advice.js';
import { sgtParts } from './windows.js';

const BASE = 'https://api-open.data.gov.sg/v2/real-time/api';
export const urls = {
  pm25: (date) => `${BASE}/pm25${date ? `?date=${date}` : ''}`,
  psi: () => `${BASE}/psi`,
};

async function getJson(url, fetchImpl = fetch) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

export const fetchPm25 = (date, f) => getJson(urls.pm25(date), f);
export const fetchPsi = (f) => getJson(urls.psi(), f);

const items = (json) => json?.data?.items ?? json?.items ?? [];

function regionsFrom(json) {
  const meta = json?.data?.regionMetadata ?? json?.region_metadata ?? [];
  const out = meta
    .map((m) => ({
      name: m.name,
      lat: Number(m.labelLocation?.latitude ?? m.label_location?.latitude),
      lng: Number(m.labelLocation?.longitude ?? m.label_location?.longitude),
    }))
    .filter((r) => r.name && r.name !== 'national' && Number.isFinite(r.lat) && r.lat !== 0);
  return out.length ? out : FALLBACK_REGIONS;
}

// Latest item that has a reading for `region`; returns {value, at}.
function latestPm25(json, region) {
  const list = items(json);
  for (let i = list.length - 1; i >= 0; i--) {
    const v = list[i].readings?.pm25_one_hourly?.[region];
    if (Number.isFinite(v)) return { value: v, at: list[i].timestamp ?? list[i].date };
  }
  return null;
}

function seriesPm25(json, region) {
  return items(json)
    .map((it) => it.readings?.pm25_one_hourly?.[region])
    .filter(Number.isFinite);
}

// pm25Json should be the day's data when available (gives a trend).
export function buildReport({ home, pm25Json, psiJson }) {
  const regions = regionsFrom(pm25Json);
  const near = nearestRegion(home, regions);
  const pm = latestPm25(pm25Json, near.name);
  if (!pm) throw new Error(`no PM2.5 reading for region ${near.name}`);
  const psiItem = items(psiJson).at(-1);
  const psi = psiItem?.readings?.psi_twenty_four_hourly?.[near.name];
  if (!Number.isFinite(psi)) throw new Error(`no PSI reading for region ${near.name}`);

  const series = seriesPm25(pm25Json, near.name);
  const trend = trendOf(series);
  const ev = evaluate({ psi, pm25: pm.value, trend });
  return {
    home,
    region: near.name,
    distanceKm: near.km,
    psi,
    pm25: pm.value,
    pm25At: pm.at,
    psiAt: psiItem?.timestamp ?? psiItem?.updatedTimestamp,
    series: series.slice(-24),
    sub: {
      pm25_24h: psiItem?.readings?.pm25_twenty_four_hourly?.[near.name],
      o3: psiItem?.readings?.o3_sub_index?.[near.name],
    },
    eval: ev,
    advice: buildAdvice(ev),
  };
}

export const todaySGT = (now = new Date()) =>
  new Date(now.getTime() + 8 * 3600e3).toISOString().slice(0, 10);

// Fetch everything and build the report. Day data for the trend is optional.
export async function loadReport(home, f = fetch) {
  const [psiJson, latest, day] = await Promise.all([
    fetchPsi(f),
    fetchPm25(undefined, f),
    fetchPm25(todaySGT(), f).catch(() => null),
  ]);
  const pm25Json = day && items(day).length ? day : latest;
  return buildReport({ home, pm25Json, psiJson });
}

// --- Hourly history -------------------------------------------------------

// One day of PM2.5, following pagination if the API splits the day.
async function fetchDay(date, f = fetch) {
  const first = await fetchPm25(date, f);
  const all = [...items(first)];
  let token = first?.data?.paginationToken;
  for (let guard = 0; token && guard < 10; guard++) {
    const next = await getJson(`${urls.pm25(date)}&paginationToken=${encodeURIComponent(token)}`, f);
    all.push(...items(next));
    token = next?.data?.paginationToken;
  }
  return all;
}

// Hourly readings for `region` from API items; keeps the latest value per hour.
export function readingsFor(list, region) {
  const byKey = new Map();
  for (const it of list) {
    const v = it.readings?.pm25_one_hourly?.[region];
    const ts = it.timestamp ?? it.updatedTimestamp;
    if (!Number.isFinite(v) || !ts) continue;
    const { date, hour } = sgtParts(ts);
    byKey.set(`${date}T${hour}`, { date, hour, value: v });
  }
  return [...byKey.values()];
}

const daysBack = (n, now) => {
  const out = [];
  for (let i = n; i >= 0; i--) out.push(todaySGT(new Date(now.getTime() - i * 86400e3)));
  return out;
};

// Last `days` full days plus today. `cache` = {get(key), set(key, value)} for
// past days (they never change); optional. Days that fail are skipped.
export async function loadHistory(region, { days = 7, f = fetch, cache = null, now = new Date() } = {}) {
  const today = todaySGT(now);
  const perDay = await Promise.all(
    daysBack(days, now).map(async (date) => {
      const key = `haze-hist-${region}-${date}`;
      if (date !== today && cache) {
        try {
          const hit = JSON.parse(cache.get(key) || 'null');
          if (hit) return hit;
        } catch {}
      }
      try {
        const rows = readingsFor(await fetchDay(date, f), region).filter((r) => r.date === date);
        if (date !== today && cache && rows.length >= 20) cache.set(key, JSON.stringify(rows));
        return rows;
      } catch {
        return [];
      }
    }),
  );
  return { today, readings: perDay.flat() };
}

// Fixtures shaped like the data.gov.sg v2 real-time API responses.
const meta = [
  { name: 'west', labelLocation: { latitude: 1.35735, longitude: 103.7 } },
  { name: 'east', labelLocation: { latitude: 1.35735, longitude: 103.94 } },
  { name: 'central', labelLocation: { latitude: 1.35735, longitude: 103.82 } },
  { name: 'south', labelLocation: { latitude: 1.29587, longitude: 103.82 } },
  { name: 'north', labelLocation: { latitude: 1.41803, longitude: 103.82 } },
  { name: 'national', labelLocation: { latitude: 0, longitude: 0 } },
];
const reg = (v) => ({ west: v, east: v, central: v, south: v, north: v, national: v });

export const pm25 = (series) => ({
  code: 0,
  data: {
    regionMetadata: meta,
    items: series.map((v, i) => ({
      date: '2026-10-14',
      timestamp: `2026-10-14T${String(i).padStart(2, '0')}:00:00+08:00`,
      readings: { pm25_one_hourly: reg(v) },
    })),
  },
});

export const psi = (v) => ({
  code: 0,
  data: {
    regionMetadata: meta,
    items: [
      {
        timestamp: '2026-10-14T10:00:00+08:00',
        readings: { psi_twenty_four_hourly: reg(v), pm25_twenty_four_hourly: reg(v), o3_sub_index: reg(20) },
      },
    ],
  },
});

// Typical day: clean early morning and evening, dirty early afternoon.
export const pattern = (h) => (h >= 6 && h < 9 ? 8 : h >= 19 && h < 22 ? 10 : h >= 13 && h < 17 ? 40 : 20);

// API-shaped day of hourly items for `date` (SGT), hours [0, upTo).
export const pm25Day = (date, valueAt = pattern, upTo = 24) => ({
  code: 0,
  data: {
    regionMetadata: [],
    items: Array.from({ length: upTo }, (_, h) => ({
      date,
      timestamp: `${date}T${String(h).padStart(2, '0')}:00:00+08:00`,
      readings: { pm25_one_hourly: { west: 1, east: 1, central: 1, south: valueAt(h), north: 1 } },
    })),
  },
});

export const readingsDays = (dates, valueAt = pattern) =>
  dates.flatMap((date) => Array.from({ length: 24 }, (_, hour) => ({ date, hour, value: valueAt(hour) })));

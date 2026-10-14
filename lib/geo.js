// Geo helpers shared by the browser dashboard and the Lark alert script.

// NEA region label points; fallback if the API omits regionMetadata.
export const FALLBACK_REGIONS = [
  { name: 'west', lat: 1.35735, lng: 103.7 },
  { name: 'east', lat: 1.35735, lng: 103.94 },
  { name: 'central', lat: 1.35735, lng: 103.82 },
  { name: 'south', lat: 1.29587, lng: 103.82 },
  { name: 'north', lat: 1.41803, lng: 103.82 },
];

const toRad = (d) => (d * Math.PI) / 180;

export function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Pick the region whose label point is nearest to `home`.
// `regions` = [{name, lat, lng}], optionally limited to names that have a reading.
export function nearestRegion(home, regions) {
  let best = null;
  for (const r of regions) {
    const km = haversineKm(home, r);
    if (!best || km < best.km) best = { ...r, km };
  }
  return best;
}

export async function geocodePostal(postal, fetchImpl = fetch) {
  const url = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(
    postal,
  )}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`OneMap HTTP ${res.status}`);
  const json = await res.json();
  const hit = json.results?.[0];
  if (!hit) throw new Error('postal code not found');
  return {
    postal,
    lat: Number(hit.LATITUDE),
    lng: Number(hit.LONGITUDE),
    address: hit.ADDRESS,
  };
}

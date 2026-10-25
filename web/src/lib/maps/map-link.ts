/**
 * Coordenadas a partir de um link de mapa colado pelo lojista.
 * Só lê o que está escrito no link — nunca adivinha. Links curtos
 * (maps.app.goo.gl) não trazem coordenadas: o servidor segue o
 * redirecionamento oficial e tenta de novo (ver resolveMapLinkAction).
 */
export type LinkPoint = { latitude: number; longitude: number };

const valid = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
const pair = (a?: string, b?: string): LinkPoint | null => {
  if (a === undefined || b === undefined) return null;
  const lat = Number(a), lng = Number(b);
  return valid(lat, lng) ? { latitude: lat, longitude: lng } : null;
};
const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';

export function coordinatesFromMapLink(raw: string): LinkPoint | null {
  const text = (raw ?? '').trim();
  if (!text || text.length > 2000) return null;
  let decoded = text;
  try { decoded = decodeURIComponent(text); } catch { /* mantém o texto original */ }
  // Ponto do lugar no Google (mais preciso que o centro da tela): !3dLAT!4dLNG
  const place = decoded.match(new RegExp(`!3d${NUM}!4d${NUM}`));
  if (place) { const p = pair(place[1], place[2]); if (p) return p; }
  // geo:lat,lng
  const geo = decoded.match(new RegExp(`^geo:${NUM},${NUM}`, 'i'));
  if (geo) { const p = pair(geo[1], geo[2]); if (p) return p; }
  // Parâmetros com "lat,lng": q, query, ll, center, destination, daddr, sll
  for (const key of ['q', 'query', 'll', 'center', 'destination', 'daddr', 'sll']) {
    const m = decoded.match(new RegExp(`[?&]${key}=(?:loc:)?${NUM}\\s*,\\s*${NUM}`));
    if (m) { const p = pair(m[1], m[2]); if (p) return p; }
  }
  // OpenStreetMap: mlat/mlon ou #map=zoom/lat/lng
  const mlat = decoded.match(new RegExp(`[?&]mlat=${NUM}`)), mlon = decoded.match(new RegExp(`[?&]mlon=${NUM}`));
  if (mlat && mlon) { const p = pair(mlat[1], mlon[1]); if (p) return p; }
  const osm = decoded.match(new RegExp(`#map=\\d+(?:\\.\\d+)?/${NUM}/${NUM}`));
  if (osm) { const p = pair(osm[1], osm[2]); if (p) return p; }
  // Google: /@lat,lng,zoom (centro da tela)
  const at = decoded.match(new RegExp(`/@${NUM},${NUM}`));
  if (at) { const p = pair(at[1], at[2]); if (p) return p; }
  // Coordenadas coladas diretamente: "-8.0045, -34.8957"
  const bare = decoded.match(new RegExp(`^${NUM}\\s*,\\s*${NUM}$`));
  if (bare) { const p = pair(bare[1], bare[2]); if (p) return p; }
  return null;
}

/** Links curtos que precisam seguir o redirecionamento para revelar o ponto. */
export function isShortMapLink(raw: string) {
  try {
    const url = new URL(raw.trim());
    return ['maps.app.goo.gl', 'goo.gl', 'g.co'].includes(url.hostname) && url.protocol === 'https:';
  } catch { return false; }
}

import 'server-only';

/**
 * Rota pelas ruas. Só existe com um serviço de roteamento configurado:
 *   ROUTING_PROVIDER=osrm e OSRM_URL=https://seu-servidor-osrm, ou
 *   ROUTING_PROVIDER=ors e ORS_API_KEY=<chave do openrouteservice.org>
 * A chave fica só no servidor; o aplicativo recebe apenas a geometria.
 * Sem isso, a tela mostra mapa e destino e oferece Google Maps/Waze; nunca
 * desenha linha reta como se fosse rota nem inventa distância ou tempo.
 */
export type RoutePoint = { latitude: number; longitude: number };
export type RouteResult =
  | { available: true; coordinates: Array<[number, number]>; distanceMeters: number; durationSeconds: number; provider: string }
  | { available: false; reason: 'not_configured' | 'unavailable' };

export function routingConfigured() {
  if (process.env.ROUTING_PROVIDER === 'ors') return Boolean(process.env.ORS_API_KEY);
  return process.env.ROUTING_PROVIDER === 'osrm' && /^https:\/\//.test(process.env.OSRM_URL ?? '');
}

type Geometry = { coordinates?: Array<[number, number]> };
function toRoute(coordinates: Array<[number, number]> | undefined, distance: number | undefined, duration: number | undefined, provider: string): RouteResult {
  if (!coordinates?.length || !Number.isFinite(distance) || !Number.isFinite(duration)) return { available: false, reason: 'unavailable' };
  // GeoJSON vem como [lng, lat]; o mapa usa [lat, lng].
  return { available: true, coordinates: coordinates.map(([lng, lat]) => [lat, lng]), distanceMeters: distance!, durationSeconds: duration!, provider };
}

async function openRouteService(from: RoutePoint, to: RoutePoint): Promise<RouteResult> {
  const base = (process.env.ORS_URL ?? 'https://api.openrouteservice.org').replace(/\/+$/, '');
  try {
    const response = await fetch(`${base}/v2/directions/driving-car/geojson`, {
      method: 'POST',
      headers: { Authorization: process.env.ORS_API_KEY!, 'Content-Type': 'application/json', Accept: 'application/geo+json' },
      body: JSON.stringify({ coordinates: [[from.longitude, from.latitude], [to.longitude, to.latitude]] }),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!response.ok) return { available: false, reason: 'unavailable' };
    const data = (await response.json()) as { features?: Array<{ geometry?: Geometry; properties?: { summary?: { distance?: number; duration?: number } } }> };
    const feature = data.features?.[0];
    return toRoute(feature?.geometry?.coordinates, feature?.properties?.summary?.distance, feature?.properties?.summary?.duration, 'openrouteservice');
  } catch {
    return { available: false, reason: 'unavailable' };
  }
}

export async function streetRoute(from: RoutePoint, to: RoutePoint): Promise<RouteResult> {
  if (!routingConfigured()) return { available: false, reason: 'not_configured' };
  if (process.env.ROUTING_PROVIDER === 'ors') return openRouteService(from, to);
  const base = process.env.OSRM_URL!.replace(/\/+$/, '');
  const url = `${base}/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!response.ok) return { available: false, reason: 'unavailable' };
    const data = (await response.json()) as { code?: string; routes?: Array<{ distance: number; duration: number; geometry?: Geometry }> };
    const route = data.code === 'Ok' ? data.routes?.[0] : undefined;
    return toRoute(route?.geometry?.coordinates, route?.distance, route?.duration, 'OSRM');
  } catch {
    return { available: false, reason: 'unavailable' };
  }
}

/** Rota pelas ruas passando por vários pontos, na ordem dada (2 a 25 pontos). */
export type MultiRouteResult =
  | { available: true; coordinates: Array<[number, number]>; distanceMeters: number; durationSeconds: number; legs: Array<{ distanceMeters: number; durationSeconds: number }>; provider: string }
  | { available: false; reason: 'not_configured' | 'unavailable' };

const validPoint = (p: RoutePoint) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;

export async function streetRouteThrough(points: RoutePoint[]): Promise<MultiRouteResult> {
  if (!routingConfigured()) return { available: false, reason: 'not_configured' };
  if (points.length < 2 || points.length > 25 || !points.every(validPoint)) return { available: false, reason: 'unavailable' };
  try {
    if (process.env.ROUTING_PROVIDER === 'ors') {
      const base = (process.env.ORS_URL ?? 'https://api.openrouteservice.org').replace(/\/+$/, '');
      const response = await fetch(`${base}/v2/directions/driving-car/geojson`, { method: 'POST', headers: { Authorization: process.env.ORS_API_KEY!, 'Content-Type': 'application/json', Accept: 'application/geo+json' }, body: JSON.stringify({ coordinates: points.map(p => [p.longitude, p.latitude]) }), signal: AbortSignal.timeout(10000), cache: 'no-store' });
      if (!response.ok) return { available: false, reason: 'unavailable' };
      const data = (await response.json()) as { features?: Array<{ geometry?: Geometry; properties?: { summary?: { distance?: number; duration?: number }; segments?: Array<{ distance?: number; duration?: number }> } }> };
      const feature = data.features?.[0];
      const route = toRoute(feature?.geometry?.coordinates, feature?.properties?.summary?.distance, feature?.properties?.summary?.duration, 'openrouteservice');
      if (!route.available) return route;
      return { ...route, legs: (feature?.properties?.segments ?? []).map(s => ({ distanceMeters: s.distance ?? 0, durationSeconds: s.duration ?? 0 })) };
    }
    const base = process.env.OSRM_URL!.replace(/\/+$/, '');
    const response = await fetch(`${base}/route/v1/driving/${points.map(p => `${p.longitude},${p.latitude}`).join(';')}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!response.ok) return { available: false, reason: 'unavailable' };
    const data = (await response.json()) as { code?: string; routes?: Array<{ distance: number; duration: number; geometry?: Geometry; legs?: Array<{ distance: number; duration: number }> }> };
    const best = data.code === 'Ok' ? data.routes?.[0] : undefined;
    const route = toRoute(best?.geometry?.coordinates, best?.distance, best?.duration, 'OSRM');
    if (!route.available) return route;
    return { ...route, legs: (best?.legs ?? []).map(l => ({ distanceMeters: l.distance, durationSeconds: l.duration })) };
  } catch {
    return { available: false, reason: 'unavailable' };
  }
}

/** Matriz de tempo de viagem (segundos) entre os pontos, pelas ruas. */
export async function durationMatrix(points: RoutePoint[]): Promise<number[][] | null> {
  if (!routingConfigured() || points.length < 2 || points.length > 25 || !points.every(validPoint)) return null;
  try {
    let durations: Array<Array<number | null>> | undefined;
    if (process.env.ROUTING_PROVIDER === 'ors') {
      const base = (process.env.ORS_URL ?? 'https://api.openrouteservice.org').replace(/\/+$/, '');
      const response = await fetch(`${base}/v2/matrix/driving-car`, { method: 'POST', headers: { Authorization: process.env.ORS_API_KEY!, 'Content-Type': 'application/json' }, body: JSON.stringify({ locations: points.map(p => [p.longitude, p.latitude]), metrics: ['duration'] }), signal: AbortSignal.timeout(10000), cache: 'no-store' });
      if (!response.ok) return null;
      durations = ((await response.json()) as { durations?: Array<Array<number | null>> }).durations;
    } else {
      const base = process.env.OSRM_URL!.replace(/\/+$/, '');
      const response = await fetch(`${base}/table/v1/driving/${points.map(p => `${p.longitude},${p.latitude}`).join(';')}?annotations=duration`, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
      if (!response.ok) return null;
      const data = (await response.json()) as { code?: string; durations?: Array<Array<number | null>> };
      durations = data.code === 'Ok' ? data.durations : undefined;
    }
    if (!durations || durations.length !== points.length) return null;
    return durations.map(row => row.map(value => (typeof value === 'number' && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY)));
  } catch {
    return null;
  }
}

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

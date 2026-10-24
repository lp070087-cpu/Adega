import 'server-only';

/**
 * Rota pelas ruas. Só existe com um serviço de roteamento configurado:
 *   ROUTING_PROVIDER=osrm e OSRM_URL=https://seu-servidor-osrm
 * Sem isso, a tela mostra mapa e destino e oferece Google Maps/Waze; nunca
 * desenha linha reta como se fosse rota nem inventa distância ou tempo.
 */
export type RoutePoint = { latitude: number; longitude: number };
export type RouteResult =
  | { available: true; coordinates: Array<[number, number]>; distanceMeters: number; durationSeconds: number; provider: string }
  | { available: false; reason: 'not_configured' | 'unavailable' };

export function routingConfigured() {
  return process.env.ROUTING_PROVIDER === 'osrm' && /^https:\/\//.test(process.env.OSRM_URL ?? '');
}

export async function streetRoute(from: RoutePoint, to: RoutePoint): Promise<RouteResult> {
  if (!routingConfigured()) return { available: false, reason: 'not_configured' };
  const base = process.env.OSRM_URL!.replace(/\/+$/, '');
  const url = `${base}/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!response.ok) return { available: false, reason: 'unavailable' };
    const data = (await response.json()) as { code?: string; routes?: Array<{ distance: number; duration: number; geometry?: { coordinates?: Array<[number, number]> } }> };
    const route = data.code === 'Ok' ? data.routes?.[0] : undefined;
    const coordinates = route?.geometry?.coordinates;
    if (!route || !coordinates?.length || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) return { available: false, reason: 'unavailable' };
    // GeoJSON vem como [lng, lat]; o mapa usa [lat, lng].
    return { available: true, coordinates: coordinates.map(([lng, lat]) => [lat, lng]), distanceMeters: route.distance, durationSeconds: route.duration, provider: 'OSRM' };
  } catch {
    return { available: false, reason: 'unavailable' };
  }
}

import type { Map as LeafletMap } from 'leaflet';
import 'maplibre-gl/dist/maplibre-gl.css';

export type BasemapStatus = 'loading' | 'ready' | 'unavailable';

export const DRIVER_MAP_REGION: [number, number] = [-8.0543, -34.8813];
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const ATTRIBUTION = '<a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · © <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';

export function loadDriverBasemap(map: LeafletMap, onStatus: (status: BasemapStatus) => void) {
  let disposed = false;
  onStatus('loading');
  const timeout = window.setTimeout(() => onStatus('unavailable'), 12000);

  void import('@maplibre/maplibre-gl-leaflet').then(({ maplibreGL }) => {
    if (disposed) return;
    const layer = maplibreGL({ style: STYLE_URL, attributionControl: false }).addTo(map);
    map.attributionControl?.setPrefix(false).addAttribution(ATTRIBUTION);
    const basemap = layer.getMaplibreMap();

    // Leaflet being ready only means its controls exist. Wait for actual
    // geographic features from the provider before marking the map ready.
    basemap.on('idle', () => {
      if (disposed || !basemap.queryRenderedFeatures().length) return;
      window.clearTimeout(timeout);
      onStatus('ready');
    });
    basemap.getCanvas().addEventListener('webglcontextlost', () => {
      if (!disposed) onStatus('unavailable');
    });
  }).catch(() => {
    if (disposed) return;
    window.clearTimeout(timeout);
    onStatus('unavailable');
  });

  return () => {
    disposed = true;
    window.clearTimeout(timeout);
  };
}

'use client';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * "Usar minha localização para navegação" — escolha do entregador, guardada
 * só neste aparelho. A posição nunca vai para o painel da loja; com a opção
 * ligada, ela é usada no mapa e enviada apenas para calcular a rota.
 */
const KEY = 'df-driver-location';
const EVENT = 'df-driver-location-change';

function read(): boolean {
  try { return window.localStorage.getItem(KEY) === 'on'; } catch { return false; }
}
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener('storage', callback);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener('storage', callback); };
}
export function setDriverLocationPref(on: boolean) {
  try { window.localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* armazenamento bloqueado: vale só nesta tela */ }
  window.dispatchEvent(new Event(EVENT));
}
export function useDriverLocationPref(): [boolean, (on: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, read, () => false);
  return [enabled, useCallback((on: boolean) => setDriverLocationPref(on), [])];
}

/** Pede a permissão do navegador. Resolve com o motivo quando não dá. */
export function requestDriverLocation(): Promise<{ ok: true } | { ok: false; reason: 'denied' | 'unavailable' }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation || !window.isSecureContext) { resolve({ ok: false, reason: 'unavailable' }); return; }
    navigator.geolocation.getCurrentPosition(
      () => resolve({ ok: true }),
      (error) => resolve({ ok: false, reason: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

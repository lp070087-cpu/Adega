'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { MapPin } from 'lucide-react';
import type { ConfirmedPlace, PlaceFields, Point } from '@/components/maps/LocationPicker';

const LocationPicker = dynamic(() => import('@/components/maps/LocationPicker').then((m) => m.LocationPicker), { ssr: false });

/** Evento para pré-carregar um ponto salvo (endereço cadastrado do cliente). */
export const PIN_PRESET_EVENT = 'delivery-pin-preset';
export type PinPreset = { point: Point | null; label?: string | null };

/**
 * Ponto exato da entrega. O endereço digitado é o texto; aqui o cliente abre
 * o mapa em tela cheia, posiciona o pino central e confirma. Só o ponto
 * confirmado vai para o formulário (inputs ocultos) — nunca a coordenada
 * aproximada da busca ou do GPS.
 */
export function DeliveryPinPicker({
  slug,
  storeCenter,
  readAddress,
  onFields,
  onPointChange,
  names = { latitude: 'deliveryLatitude', longitude: 'deliveryLongitude' },
  initial = null,
  title = 'Ponto exato da entrega',
}: {
  slug: string;
  storeCenter: Point | null;
  readAddress: () => string;
  /** Preenche campos vazios do formulário com o endereço aproximado. */
  onFields?: (fields: PlaceFields) => void;
  /** Avisa quando o ponto confirmado muda (ex.: recalcular a prévia do frete). */
  onPointChange?: (point: Point | null) => void;
  names?: { latitude: string; longitude: string };
  initial?: ConfirmedPlace | null;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<ConfirmedPlace | null>(initial);
  useEffect(() => { onPointChange?.(confirmed ? { latitude: confirmed.latitude, longitude: confirmed.longitude } : null); }, [confirmed?.latitude, confirmed?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onPreset = (event: Event) => {
      const detail = (event as CustomEvent<PinPreset>).detail;
      setConfirmed(detail?.point ? { ...detail.point, label: detail.label ?? null, fields: null } : null);
    };
    window.addEventListener(PIN_PRESET_EVENT, onPreset);
    return () => window.removeEventListener(PIN_PRESET_EVENT, onPreset);
  }, []);

  return (
    <section className="rounded-xl border border-ink-200 bg-white p-3" data-testid="delivery-pin">
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${confirmed ? 'bg-success-bg text-success' : 'bg-brand-light text-brand'}`} aria-hidden>
          <MapPin size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.86rem] font-bold text-ink-900">{title}</p>
          {confirmed ? (
            <p className="text-[0.78rem] text-ink-600" data-testid="delivery-pin-summary">
              <span className="font-semibold text-success">✓ Local confirmado no mapa.</span>{confirmed.label ? ` Perto de: ${confirmed.label}` : ''}
            </p>
          ) : (
            <p className="text-[0.76rem] text-ink-500">Marque no mapa onde o entregador deve chegar. Funciona sem liberar a localização do celular.</p>
          )}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-brand px-3 text-[0.82rem] font-bold text-white hover:bg-brand-dark">
          {confirmed ? 'Alterar local no mapa' : 'Marcar local no mapa'}
        </button>
        {confirmed && (
          <button type="button" onClick={() => setConfirmed(null)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink-200 px-3 text-[0.8rem] font-semibold text-ink-700">
            Remover
          </button>
        )}
      </div>
      {confirmed && (
        <>
          <input type="hidden" name={names.latitude} value={confirmed.latitude.toFixed(6)} />
          <input type="hidden" name={names.longitude} value={confirmed.longitude.toFixed(6)} />
        </>
      )}
      {open && createPortal(
        <LocationPicker
          slug={slug}
          start={confirmed}
          fallbackCenter={storeCenter}
          initialQuery={confirmed ? undefined : readAddress()}
          onClose={() => setOpen(false)}
          onConfirm={(place) => {
            setConfirmed(place);
            if (place.fields && onFields) onFields(place.fields);
            setOpen(false);
          }}
        />,
        document.body,
      )}
    </section>
  );
}

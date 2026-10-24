'use client';

import { useRef } from 'react';
import { DeliveryPinPicker } from '@/components/store/DeliveryPinPicker';
import type { Point } from '@/components/maps/LocationPicker';

/**
 * Ponto no mapa e referência de um endereço salvo na conta. O endereço
 * aproximado do mapa só preenche campos que estiverem vazios.
 */
export function AddressMapField({ slug, storeCenter, initial, reference }: { slug: string; storeCenter: Point | null; initial: Point | null; reference: string | null }) {
  const anchor = useRef<HTMLDivElement>(null);
  const field = (name: string) => anchor.current?.closest('form')?.elements.namedItem(name) as HTMLInputElement | null | undefined;
  return (
    <div ref={anchor} className="customer-address-map">
      <DeliveryPinPicker
        slug={slug}
        storeCenter={storeCenter}
        title="Ponto exato no mapa"
        names={{ latitude: 'latitude', longitude: 'longitude' }}
        initial={initial ? { ...initial, label: null, fields: null } : null}
        readAddress={() => ['street', 'number', 'district', 'city'].map((n) => field(n)?.value.trim()).filter(Boolean).join(', ')}
        onFields={(fields) => {
          const put = (name: string, value: string | null) => { const input = field(name); if (input && value && !input.value.trim()) input.value = value; };
          put('street', fields.street); put('number', fields.number); put('district', fields.district); put('city', fields.city); put('state', fields.state); put('zipCode', fields.zipCode);
        }}
      />
      <label>Referência (opcional)<input name="reference" defaultValue={reference ?? ''} maxLength={200} placeholder="Ex.: portão lateral, entrada pela escadaria" /></label>
    </div>
  );
}

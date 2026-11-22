'use client';

import { Fragment } from 'react';
import { ProductThumb, type ProductThumbProps } from './ProductThumb';

export type ComboArtworkItem = Pick<ProductThumbProps, 'customImageUrl' | 'globalImageUrl' | 'emoji'> & {
  productId: string;
  name: string;
};

export function ComboArtwork({ items, size = 64 }: { items: ComboArtworkItem[]; size?: number }) {
  return (
    <div className="flex max-w-full items-center justify-center gap-1 overflow-hidden px-1" role="img" aria-label={items.map((item) => item.name).join(' + ')}>
      {items.slice(0, 3).map((item, index) => (
        <Fragment key={item.productId}>
          {index > 0 && <span aria-hidden="true" className="shrink-0 font-bold text-ink-500">+</span>}
          <div className="min-w-0" aria-hidden="true">
            <ProductThumb {...item} size={size} alt={item.name} className="max-w-full" />
          </div>
        </Fragment>
      ))}
      {items.length > 3 && <span aria-hidden="true" className="shrink-0 text-xs text-ink-500">+{items.length - 3}</span>}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { ProductModal } from '@/components/catalog/ProductModal';
import { Button } from '@/components/ui';

export function NewStockProduct({ categories }: {
  categories: Array<{ id: string; name: string; emoji: string | null }>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>Novo produto próprio</Button>
      {open && <ProductModal open product={null} categories={categories} onClose={() => setOpen(false)} />}
    </>
  );
}

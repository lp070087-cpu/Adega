'use client';

import { useActionState } from 'react';
import { saveStoreWhatsApp } from '@/app/actions/store-whatsapp';
import { Button, Field, Input } from '@/components/ui';

export function StoreWhatsAppNumber({ value }: { value: string | null }) {
  const [result, save, pending] = useActionState(saveStoreWhatsApp, null);
  return (
    <form action={save} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="WhatsApp da loja" className="min-w-40 flex-1">
          <Input name="whatsapp" type="tel" defaultValue={value ?? ''} placeholder="DDD + número" maxLength={24} />
        </Field>
        <Button type="submit" loading={pending}>Salvar número</Button>
      </div>
      {result && <p role="status" className={result.ok ? 'text-sm text-success' : 'text-sm text-danger'}>{result.message}</p>}
    </form>
  );
}

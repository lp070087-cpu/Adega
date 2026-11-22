'use client';

import { useState } from 'react';
import { whatsappHref } from '@/lib/whatsapp';
import { Field, Input, Select, Textarea } from '@/components/ui';

type Contact = { id: string; name: string; phone: string | null };

export function WhatsAppMessage({ contacts, initialMessage = '' }: { contacts?: Contact[]; initialMessage?: string }) {
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState(initialMessage);
  const phone = contacts ? contacts.find((contact) => contact.id === recipient)?.phone : recipient;
  const href = whatsappHref(phone, message.trim());
  if (contacts && !contacts.length) return <p className="text-sm text-ink-500">Nenhum cliente elegível com telefone cadastrado.</p>;
  return (
    <div className="space-y-3">
      <Field label={contacts ? 'Cliente' : 'WhatsApp do cliente'}>
        {contacts ? (
          <Select value={recipient} onChange={(event) => setRecipient(event.target.value)}>
            <option value="">Selecione um cliente</option>
            {contacts.map((contact) => <option value={contact.id} key={contact.id}>{contact.name}</option>)}
          </Select>
        ) : <Input type="tel" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="DDD + número" />}
      </Field>
      <Field label="Mensagem">
        <Textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} maxLength={1000} placeholder="Digite a mensagem para o cliente" />
      </Field>
      {href && <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white">Abrir conversa no WhatsApp</a>}
      <p className="text-xs text-ink-500">A conversa abre no WhatsApp conectado ao seu dispositivo. Revise a mensagem e toque em Enviar.</p>
    </div>
  );
}

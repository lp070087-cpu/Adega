'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { updateOwnDriverProfile } from '@/app/actions/driver-profile';
import { Alert, Button, Card } from '@/components/ui';
import { formatPhone } from '@/lib/utils';

export type DriverAccountDetails = {
  email: string | null;
  username: string | null;
  phone: string;
  address: string | null;
};

const vehicleLabels: Record<string, string> = {
  MOTORCYCLE: 'Moto',
  BICYCLE: 'Bicicleta',
  CAR: 'Carro',
  ON_FOOT: 'A pé',
  OTHER: 'Outro',
};

export function DriverAccount({ name, vehicle, plate, store, account, preview }: {
  name: string;
  vehicle: string;
  plate: string | null;
  store: string;
  account: DriverAccountDetails;
  preview: boolean;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState(formatPhone(account.phone));
  const [address, setAddress] = useState(account.address ?? '');
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFeedback(null);
    start(async () => {
      try {
        const result = await updateOwnDriverProfile(form);
        setFeedback({ ok: result.ok, text: result.ok ? 'Seus dados foram salvos.' : result.error });
        if (result.ok) router.refresh();
      } catch {
        setFeedback({ ok: false, text: 'Não foi possível salvar agora. Confira sua conexão e tente novamente.' });
      }
    });
  }

  return (
    <Card className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-light text-lg font-extrabold text-brand" aria-hidden>{name.slice(0, 2).toUpperCase()}</span>
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold text-ink-900">Minha conta</h1>
          <p className="break-words text-sm text-ink-600">{name}</p>
        </div>
      </div>
      <dl className="grid gap-3 rounded-xl bg-ink-50 p-3 sm:grid-cols-2">
        <ProfileDetail label="E-mail de acesso" value={account.email} />
        {account.username && <ProfileDetail label="Usuário" value={account.username} />}
        <ProfileDetail label="Estabelecimento" value={store} />
        <ProfileDetail label="Veículo" value={preview ? null : vehicleLabels[vehicle] ?? vehicle} />
        <ProfileDetail label="Placa" value={plate} />
        {preview && <><ProfileDetail label="Celular" value={account.phone ? formatPhone(account.phone) : null} /><ProfileDetail label="Endereço" value={account.address} /></>}
      </dl>
      {!preview && (
        <form onSubmit={save} className="space-y-4">
          <label className="grid gap-1">
            <span className="field-label">Celular nesta loja</span>
            <input className="field-input" name="phone" type="tel" autoComplete="tel" maxLength={24} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(00) 00000-0000" />
          </label>
          <label className="grid gap-1">
            <span className="field-label">Endereço pessoal</span>
            <textarea className="field-input min-h-24 resize-y" name="address" autoComplete="street-address" maxLength={300} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Rua, número, bairro, cidade, UF e CEP" />
            <span className="text-xs text-ink-500">Este endereço fica na sua conta.</span>
          </label>
          <Button type="submit" disabled={pending}>{pending ? 'Salvando…' : 'Salvar meus dados'}</Button>
          {feedback && <Alert tone={feedback.ok ? 'success' : 'danger'}>{feedback.text}</Alert>}
        </form>
      )}
    </Card>
  );
}

function ProfileDetail({ label, value }: { label: string; value: string | null }) {
  return <div className="min-w-0"><dt className="text-xs font-medium text-ink-500">{label}</dt><dd className="break-words text-sm font-semibold text-ink-900">{value || 'Não informado'}</dd></div>;
}

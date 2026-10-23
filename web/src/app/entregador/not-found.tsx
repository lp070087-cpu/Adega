import Link from 'next/link';
import { DriverAuthCard } from '@/components/driver/DriverAuthCard';

/** Endereço inexistente dentro da área do entregador: volta só para o app. */
export default function DriverNotFound() {
  return (
    <DriverAuthCard>
      <p className="mt-3 text-sm text-ink-500">Esta página não existe. Confira o link enviado pela loja.</p>
      <Link href="/entregador/" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-5 font-semibold text-white">Ir para o aplicativo</Link>
    </DriverAuthCard>
  );
}

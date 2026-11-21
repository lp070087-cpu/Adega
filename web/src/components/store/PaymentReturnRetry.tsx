'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Volta do checkout com o pagamento ainda não confirmado: recarrega a
 * página (que confere de novo na InfinitePay no servidor) a cada 3 s por
 * cerca de 30 s. Depois disso, o webhook e o OrderRefresh seguem sozinhos.
 */
export function PaymentReturnRetry({ attempts = 10, interval = 3000 }: { attempts?: number; interval?: number }) {
  const router = useRouter();
  useEffect(() => {
    let left = attempts;
    const timer = window.setInterval(() => {
      if (left-- <= 0) { window.clearInterval(timer); return; }
      router.refresh();
    }, interval);
    return () => window.clearInterval(timer);
  }, [attempts, interval, router]);
  return null;
}

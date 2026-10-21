'use client';
import { useActionState } from 'react';
import type { ReactNode } from 'react';
export function AsaasForm({ action, children }: { action: (form: FormData) => Promise<void>; children: ReactNode }) {
  const [message, submit, pending] = useActionState(async (_: string, form: FormData) => {
    try { await action(form); return 'Operação concluída. Consulte a situação registrada abaixo.'; }
    catch { return 'Operação não concluída. Verifique os dados e a conexão. Se a criação já foi iniciada, consulte o Asaas antes de tentar novamente.'; }
  }, '');
  return <form action={submit} aria-busy={pending}><fieldset disabled={pending} className="platform-form">{children}</fieldset>{pending && <p role="status">Aguarde a confirmação do provedor…</p>}{message && <p role="status" className="mt-4 text-sm">{message}</p>}</form>;
}

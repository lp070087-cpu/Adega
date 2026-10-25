'use client';
import { startTransition, useActionState } from 'react';
import { requestOwnerResetAction } from '@/app/actions/auth';

export function OwnerResetRequestForm() {
  const [state, run, pending] = useActionState(requestOwnerResetAction, undefined);
  if (state?.ok) return <p role="status" className="auth-alert is-ok">Se houver uma conta com esse e-mail, você receberá o link em instantes. Confira também a caixa de spam. O link vale 30 minutos.</p>;
  return (
    <form action={run} onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); startTransition(() => run(data)); }}>
      {state?.error && <p role="alert" className="auth-alert is-error">{state.error}</p>}
      <div className="auth-field"><label htmlFor="reset-email">E-mail</label><input id="reset-email" name="email" type="email" required autoComplete="email" inputMode="email" placeholder="voce@estabelecimento.com" /></div>
      <button type="submit" className="auth-submit" disabled={pending}>{pending ? 'Enviando…' : 'Enviar link de recuperação'}</button>
    </form>
  );
}

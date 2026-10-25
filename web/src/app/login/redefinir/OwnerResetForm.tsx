'use client';
import { startTransition, useActionState } from 'react';
import { completeOwnerResetAction } from '@/app/actions/auth';
import { PasswordField } from '@/components/auth/PasswordField';

export function OwnerResetForm({ token }: { token: string }) {
  const [state, run, pending] = useActionState(completeOwnerResetAction, undefined);
  return (
    <form action={run} onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); startTransition(() => run(data)); }}>
      <input type="hidden" name="token" value={token} />
      {state?.error && <p role="alert" className="auth-alert is-error">{state.error}</p>}
      <PasswordField label="Nova senha" autoComplete="new-password" minLength={8} hint="Mínimo de 8 caracteres." />
      <PasswordField name="confirmPassword" label="Confirme a nova senha" autoComplete="new-password" minLength={8} />
      <button type="submit" className="auth-submit" disabled={pending}>{pending ? 'Salvando…' : 'Salvar nova senha'}</button>
    </form>
  );
}

'use client';
import { startTransition, useActionState } from 'react';
import { adminLoginAction } from './action';
import { PasswordField } from '@/components/auth/PasswordField';

export function LoginForm() {
  const [state, run, pending] = useActionState(adminLoginAction, { error: '' });
  return (
    <form action={run} onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); startTransition(() => run(data)); }}>
      {state.error && <div role="alert" className="auth-alert is-error">{state.error}</div>}
      <div className="auth-field"><label htmlFor="admin-email">E-mail</label><input id="admin-email" name="email" type="email" required autoComplete="username" inputMode="email" placeholder="operador@delflash.com.br" /></div>
      <PasswordField />
      <button type="submit" className="auth-submit" disabled={pending}>{pending ? 'Entrando…' : 'Entrar na administração'}</button>
    </form>
  );
}

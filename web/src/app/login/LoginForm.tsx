'use client';

import Link from 'next/link';
import { startTransition, useActionState } from 'react';
import { loginAction, type AuthActionState } from '@/app/actions/auth';
import { PasswordField } from '@/components/auth/PasswordField';

/**
 * Formulário de login do painel. A validação de verdade acontece no servidor —
 * aqui só marcamos o campo com erro quando o servidor devolve.
 */
export function LoginForm({ back }: { back?: string } = {}) {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(loginAction, undefined);
  return (
    <form action={formAction} onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); startTransition(() => formAction(data)); }}>
      {back && <input type="hidden" name="voltar" value={back} />}
      {state?.error && <p role="alert" className="auth-alert is-error">{state.error}</p>}
      <div className="auth-field">
        <label htmlFor="login-email">E-mail</label>
        <input id="login-email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="voce@estabelecimento.com" required aria-invalid={state?.field === 'email' || undefined} />
      </div>
      <PasswordField error={state?.field === 'password' ? state.error : undefined} />
      <div className="auth-row">
        <label className="auth-check"><input type="checkbox" name="remember" defaultChecked />Manter conectado</label>
        <Link href="/login/recuperar" className="auth-link">Esqueci minha senha</Link>
      </div>
      <button type="submit" className="auth-submit" disabled={pending}>{pending ? 'Entrando…' : 'Entrar'}</button>
    </form>
  );
}

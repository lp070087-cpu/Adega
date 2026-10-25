'use client';

import { startTransition, useActionState } from 'react';
import { registerAction, type AuthActionState } from '@/app/actions/auth';
import { PasswordField } from '@/components/auth/PasswordField';

export function RegisterForm() {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(registerAction, undefined);
  const errorFor = (field: string) => (state?.field === field ? state.error : undefined);
  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement>, hint?: string) => (
    <div className="auth-field">
      <label htmlFor={`reg-${name}`}>{label}</label>
      <input id={`reg-${name}`} name={name} aria-invalid={errorFor(name) ? true : undefined} {...props} />
      {errorFor(name) ? <p className="auth-field-error">{errorFor(name)}</p> : hint ? <p className="auth-hint">{hint}</p> : null}
    </div>
  );
  return (
    <form action={formAction} onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); startTransition(() => formAction(data)); }}>
      {state?.error && !state.field && <p role="alert" className="auth-alert is-error">{state.error}</p>}
      {field('name', 'Seu nome', { autoComplete: 'name', placeholder: 'Como devemos te chamar', required: true })}
      {field('email', 'E-mail', { type: 'email', autoComplete: 'email', inputMode: 'email', placeholder: 'voce@estabelecimento.com', required: true })}
      {field('phone', 'Telefone (opcional)', { inputMode: 'tel', autoComplete: 'tel', placeholder: '(00) 00000-0000' }, 'Usado só para contato da plataforma.')}
      <PasswordField autoComplete="new-password" minLength={8} hint="Mínimo de 8 caracteres." error={errorFor('password')} />
      <PasswordField name="confirmPassword" label="Confirmar senha" autoComplete="new-password" minLength={8} error={errorFor('confirmPassword')} />
      <button type="submit" className="auth-submit" disabled={pending}>{pending ? 'Criando conta…' : 'Criar conta e continuar'}</button>
      <p className="auth-hint" style={{ textAlign: 'center' }}>Sua senha é gravada apenas como hash — nem nós conseguimos lê-la.</p>
    </form>
  );
}

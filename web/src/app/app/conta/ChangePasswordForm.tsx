'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { changePasswordAction, type AuthActionState } from '@/app/actions/auth';
import { Alert, Button, Field, Input } from '@/components/ui';

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<AuthActionState, FormData>(changePasswordAction, undefined);
  const [saved, setSaved] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (!submitted.current || pending) return;
    if (state?.saved) { setSaved(true); form.current?.reset(); }
    else setSaved(false);
  }, [state, pending]);

  return (
    <form ref={form} action={(data) => { submitted.current = true; setSaved(false); action(data); }} className="space-y-3">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {saved && <Alert tone="success">Senha alterada.</Alert>}
      <Field label="Senha atual" required error={state?.field === 'currentPassword' ? state.error : undefined}>
        <Input name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Nova senha" required hint="Use pelo menos 8 caracteres, incluindo letra e número." error={state?.field === 'newPassword' ? state.error : undefined}>
        <Input name="newPassword" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirmar nova senha" required error={state?.field === 'confirmPassword' ? state.error : undefined}>
        <Input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Button type="submit" loading={pending}>Salvar nova senha</Button>
    </form>
  );
}

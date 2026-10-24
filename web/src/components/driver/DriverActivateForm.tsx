'use client';
import { startTransition, useActionState, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';
import { activateDriverAction, type DriverAccessState } from '@/app/actions/driver-access';

/** Troca obrigatória da senha temporária por uma senha definitiva. */
export function DriverActivateForm({ email, pin, store }: { email: string; pin: string; store?: string }) {
  const [state, action, pending] = useActionState<DriverAccessState, FormData>(activateDriverAction, { ok: false, message: '' });
  const [show, setShow] = useState(false);
  return (
    <form action={action} onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); startTransition(() => action(data)); }} className="mt-6 space-y-4 text-left" data-testid="driver-activate">
      <h2 className="text-lg font-bold text-ink-900">Crie sua senha</h2>
      <p className="text-sm text-ink-500">A senha temporária serve só para este primeiro acesso. Crie agora a sua senha definitiva para entrar nas próximas vezes.</p>
      {state.message && !state.ok && <p role="alert" className="rounded-lg border border-danger/25 bg-danger-bg p-3 text-sm text-danger">{state.message}</p>}
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="pin" value={pin} />
      {store && <input type="hidden" name="store" value={store} />}
      <Field label="Nova senha" required hint="Mínimo de 8 caracteres.">
        <div className="relative">
          <Input name="password" aria-label="Nova senha" type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={72} className="pr-12" autoFocus />
          <button type="button" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShow(!show)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-400">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div>
      </Field>
      <Field label="Confirme a nova senha" required>
        <Input name="confirm" aria-label="Confirme a nova senha" type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={72} />
      </Field>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="remember" defaultChecked className="h-5 w-5" />Manter conectado neste aparelho</label>
      <Button fullWidth size="lg" type="submit" loading={pending}>{pending ? 'Salvando…' : 'Salvar senha e entrar'}</Button>
    </form>
  );
}

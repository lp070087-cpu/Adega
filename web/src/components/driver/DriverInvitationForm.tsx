'use client';
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';
import { requestDriverInvitationAction, type DriverInvitationState } from '@/app/actions/driver-invitation';
const initial: DriverInvitationState = { ok: false, message: '' };
export function DriverInvitationForm({ slug, storeName, mailReady }: { slug: string; storeName: string; mailReady: boolean }) {
  const [state, action, pending] = useActionState(requestDriverInvitationAction, initial);
  const [show, setShow] = useState(false);
  return <div className="space-y-5"><div><p className="text-sm font-semibold text-brand">Convite · {storeName}</p><h1 className="mt-2 text-xl font-bold">Seu acesso de entregador</h1></div><p className="text-sm text-ink-500">Use o e-mail convidado pela loja e escolha sua senha. Você precisará confirmar o e-mail para ativá-la. Este endereço não permite cadastro sem convite.</p>{state.message && <p role={state.ok ? 'status' : 'alert'} className="rounded-lg bg-ink-50 p-3 text-sm">{state.message}</p>}
    {!mailReady && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">O convite continua pendente. A plataforma precisa configurar o envio de e-mail para concluir a ativação; não é necessário criar outro cadastro.</p>}
    <form action={action} className="space-y-4"><input name="slug" type="hidden" value={slug}/><Field label="E-mail convidado" required><Input name="email" type="email" autoComplete="email" required maxLength={254}/></Field><Field label="Escolha sua senha" required><div className="relative"><Input name="password" aria-label="Escolha sua senha" type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={72} className="pr-12"/><button type="button" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShow(!show)} className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center">{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></Field><Field label="Confirme a senha" required><Input name="confirm" type={show ? 'text' : 'password'} autoComplete="new-password" required/></Field><Button fullWidth type="submit" loading={pending} disabled={!mailReady}>Confirmar meu e-mail</Button></form>
    <Link href="/entregador/" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand">Já tenho acesso · entrar</Link><p className="text-xs text-ink-500">A aprovação é feita pela loja ao criar seu cadastro. O link de e-mail é temporário e de uso único. Acesso existente, recuperação de senha e vínculos anteriores são preservados.</p></div>;
}

'use client';
import { useActionState } from 'react';
import { platformAction } from '@/app/actions/platform';
export function AdminForm({children,action,submit='Salvar alterações'}:{children:React.ReactNode;action:string;submit?:string}){
 const [state,run,pending]=useActionState(platformAction,{ok:false,message:''});
 return <form action={run} className="platform-form"><input type="hidden" name="action" value={action}/>{children}<label className="platform-wide">Motivo administrativo<input name="reason" required minLength={5} maxLength={500} placeholder="Descreva o motivo desta alteração"/></label><label className="platform-check platform-wide"><input type="checkbox" name="confirm" required/>Confirmo os dados e autorizo esta alteração.</label><div className="platform-wide">{state.message&&<p role="status" className={state.ok?'platform-success':'platform-error'}>{state.message}</p>}<button disabled={pending} type="submit">{pending?'Salvando…':submit}</button></div></form>;
}

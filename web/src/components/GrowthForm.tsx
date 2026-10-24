'use client';
import { startTransition,useActionState } from 'react';
import { growthAction } from '@/app/actions/growth';
export function GrowthForm({action,children,submit='Salvar'}:{action:string;children:React.ReactNode;submit?:string}){
 const [state,run,pending]=useActionState(growthAction,{ok:false,message:''});
 return <form action={run} onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);startTransition(()=>run(data));}} className="grid gap-4 sm:grid-cols-2"><input type="hidden" name="action" value={action}/>{children}<label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="confirm" required/>Confirmo os dados e esta operação.</label>{state.message&&<p className={`text-sm sm:col-span-2 ${state.ok?'text-emerald-700':'text-red-700'}`} role="status">{state.message}</p>}<div className="sm:col-span-2"><button disabled={pending} className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">{pending?'Registrando…':submit}</button></div></form>;
}

// Cadastro do canal oficial por operador da plataforma (console /admin).
'use client';
import { useState,useTransition } from 'react';
import { configureAssistantChannel } from '@/app/actions/assistant';
import { Button,Input,Field } from '@/components/ui';
export function ChannelSetup({organizations}:{organizations:Array<{id:string;name:string}>}){
  const [message,setMessage]=useState('');const [pending,start]=useTransition();
  return <form className="grid gap-4 md:grid-cols-2" action={form=>start(async()=>{const result=await configureAssistantChannel(form);setMessage(result.ok?'Autorização do número verificada. Configure o webhook oficial antes de liberar a operação.':('error' in result?result.error:'Não foi possível configurar.'));})}>
    <Field label="Estabelecimento"><select name="organizationId" required className="min-h-11 rounded-lg border p-2">{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
    <Field label="Identificador oficial do número"><Input name="phoneNumberId" required inputMode="numeric"/></Field>
    <Field label="Token de acesso (não será exibido novamente)"><Input name="token" type="password" autoComplete="new-password" required/></Field>
    <Field label="Limite diário de mensagens processadas"><Input name="dailyLimit" type="number" min="1" max="10000" defaultValue="100" required/></Field>
    <Field label="Motivo administrativo"><Input name="reason" minLength={5} required/></Field>
    <Field label="Digite CONFIRMAR"><Input name="confirmation" required pattern="CONFIRMAR"/></Field>
    <Button disabled={pending}>Verificar autorização e salvar conexão</Button><p role="status" className="text-sm">{message}</p>
  </form>;
}

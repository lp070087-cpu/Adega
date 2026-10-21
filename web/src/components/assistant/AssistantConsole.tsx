'use client';
import { useState,useTransition } from 'react';
import { assistantSettings,configureAssistantChannel,processAssistantAction,retryAssistantMessage,updateAssistantThread } from '@/app/actions/assistant';
import { Alert,Button,Input,Field } from '@/components/ui';
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
const statuses:Record<string,string>={RECEIVED:'Recebida',PROCESSING:'Processando',PROCESSED:'Processada',ERROR:'Erro de processamento',QUEUED:'Na fila',SENDING:'Enviando',SENT:'Enviada',DELIVERED:'Entregue',READ:'Lida',RETRYABLE:'Nova tentativa disponível',FAILED:'Falha no envio',UNCERTAIN:'Envio incerto: conferir com atendimento humano'};
type Thread={id:string;contact:string;status:string;messages:Array<{id:string;direction:string;body:string;status:string;createdAt:string}>};
export function AssistantConsole({enabled,ready,threads}:{enabled:boolean;ready:boolean;threads:Thread[]}){
  const [message,setMessage]=useState('');const[pending,start]=useTransition();
  const run=(work:()=>Promise<any>)=>start(async()=>{const result=await work();setMessage(result.ok?'Atualizado.':result.error??'Não foi possível concluir.');});
  return <div className="space-y-5">{message&&<Alert title="Atendimento">{message}</Alert>}<div className="flex flex-wrap gap-3"><Button disabled={pending||(!enabled&&!ready)} onClick={()=>run(()=>assistantSettings({enabled:!enabled}))}>{enabled?'Desativar IA':'Ativar IA'}</Button><Button variant="ghost" disabled={pending||!enabled||!ready} onClick={()=>run(()=>processAssistantAction())}>Processar mensagens recebidas</Button></div>
    {!threads.length&&<p className="rounded-xl border bg-white p-6 text-ink-500">Nenhuma conversa recebida pelo canal oficial.</p>}
    {threads.map(thread=><section key={thread.id} className="rounded-xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">{thread.contact} · {thread.status==='BOT'?'Atendimento com IA':thread.status==='HUMAN'?'Atendimento humano':'Encerrado'}</h2><div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" disabled={pending} onClick={()=>run(()=>updateAssistantThread({threadId:thread.id,status:thread.status==='HUMAN'?'BOT':'HUMAN'}))}>{thread.status==='HUMAN'?'Retomar IA':'Transferir para humano'}</Button><Button size="sm" variant="ghost" disabled={pending} onClick={()=>run(()=>updateAssistantThread({threadId:thread.id,status:'CLOSED'}))}>Encerrar</Button></div></div><ol className="mt-4 space-y-3">{thread.messages.map(m=><li key={m.id} className={`max-w-2xl rounded-lg p-3 text-sm ${m.direction==='IN'?'bg-ink-50':'bg-orange-50'}`}><p className="mb-1 text-xs text-ink-500">{m.direction==='IN'?'Cliente':'Loja'} · {statuses[m.status]??'Atualizando'} · {new Date(m.createdAt).toLocaleString('pt-BR')}</p><p className="whitespace-pre-wrap break-words">{m.body}</p>{m.direction==='IN'&&m.status==='ERROR'&&<Button size="sm" variant="ghost" disabled={pending} onClick={()=>run(()=>retryAssistantMessage(m.id))}>Solicitar nova tentativa</Button>}</li>)}</ol></section>)}
    <p className="text-sm text-ink-500">Transferir para humano pausa respostas automáticas. A equipe responde pelo canal oficial autorizado. Envios incertos exigem conferência; não são reenviados automaticamente.</p>
  </div>;
}

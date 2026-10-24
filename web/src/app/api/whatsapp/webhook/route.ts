import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/db';
import { aiReady, assistantReady, processAssistantInbox } from '@/lib/assistant/service';
import { sameSecret, validWebhookSignature } from '@/lib/assistant/security';
export const runtime='nodejs';
export async function GET(request:NextRequest){
  if(!await assistantReady())return new NextResponse('Indisponível',{status:503});
  const q=request.nextUrl.searchParams;
  if(q.get('hub.mode')!=='subscribe'||!sameSecret(q.get('hub.verify_token'),process.env.WHATSAPP_VERIFY_TOKEN))return new NextResponse('Proibido',{status:403});
  return new NextResponse(q.get('hub.challenge')??'',{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:NextRequest){
  if(!await assistantReady())return NextResponse.json({error:'Aguardando ativação'},{status:503});
  const raw=await request.text(); if(Buffer.byteLength(raw)>262144)return new NextResponse(null,{status:413});
  if(!validWebhookSignature(raw,request.headers.get('x-hub-signature-256'),process.env.WHATSAPP_APP_SECRET))return new NextResponse(null,{status:401});
  try{
    const payload=JSON.parse(raw);if(payload.object!=='whatsapp_business_account')return new NextResponse(null,{status:400});
    // Lojas com mensagem nova: a fila da IA é processada logo após responder à Meta
    // (sem isso as respostas automáticas dependiam de uma rotina que nada acionava).
    const received=new Set<string>();
    for(const entry of (Array.isArray(payload.entry)?payload.entry:[]).slice(0,10))for(const change of (entry.changes??[]).slice(0,10)){
      const value=change.value;const phone=value?.metadata?.phone_number_id;
      if(typeof phone!=='string')continue;
      const channel=await prisma.assistantChannel.findUnique({where:{phoneNumberId:phone}});
      if(!channel?.enabled||!channel.verifiedAt)continue;
      await prisma.assistantChannel.update({where:{id:channel.id},data:{webhookVerifiedAt:new Date()}});
      for(const message of (value.messages??[]).slice(0,20)){
        if(typeof message.id!=='string'||message.id.length>300||!/^\d{8,16}$/.test(message.from??''))continue;
        if(typeof message.timestamp!=='string'||!/^\d{10,13}$/.test(message.timestamp))continue;
        const receivedAt=new Date(Number(message.timestamp)*1000);
        if(!Number.isFinite(receivedAt.getTime())||receivedAt.getTime()>Date.now()+5*60*1000)continue;
        const humanRequired=message.type!=='text'||typeof message.text?.body!=='string'||Date.now()-receivedAt.getTime()>23*60*60*1000;
        const body=typeof message.text?.body==='string'?message.text.body.slice(0,2000):'[Mensagem não textual: encaminhar para atendimento humano]';
        try{
          await prisma.$transaction(async tx=>{
            const thread=await tx.assistantThread.upsert({where:{organizationId_contact:{organizationId:channel.organizationId,contact:message.from}},create:{organizationId:channel.organizationId,contact:message.from,status:humanRequired?'HUMAN':'BOT'},update:{updatedAt:new Date(),...(humanRequired?{status:'HUMAN'}:{})}});
            await tx.assistantMessage.create({data:{organizationId:channel.organizationId,threadId:thread.id,externalId:message.id,direction:'IN',body,createdAt:receivedAt}});
          });
          if(!humanRequired)received.add(channel.organizationId);
        }catch(error){if((error as {code?:string}).code!=='P2002')throw error;}
      }
      for(const status of (value.statuses??[]).slice(0,30)){
        const mapped:Record<string,string>={delivered:'DELIVERED',read:'READ',failed:'FAILED',sent:'SENT'};
        if(typeof status.id==='string'&&mapped[status.status])await prisma.assistantMessage.updateMany({where:{organizationId:channel.organizationId,providerMessageId:status.id},data:{status:mapped[status.status]}});
      }
    }
    if(received.size&&aiReady())after(async()=>{for(const organizationId of received){try{await processAssistantInbox(organizationId);}catch{/* fica na fila para nova tentativa */}}});
    return NextResponse.json({received:true});
  }catch{return NextResponse.json({error:'Falha temporária'},{status:500});}
}

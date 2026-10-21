import { NextRequest, NextResponse } from 'next/server';
import { sameSecret } from '@/lib/assistant/security';
import { processAssistantInbox } from '@/lib/assistant/service';
export const runtime='nodejs';
export async function POST(request:NextRequest){
  if(!sameSecret(request.headers.get('authorization'),process.env.ASSISTANT_JOB_TOKEN?`Bearer ${process.env.ASSISTANT_JOB_TOKEN}`:undefined))return new NextResponse(null,{status:401});
  return NextResponse.json(await processAssistantInbox());
}

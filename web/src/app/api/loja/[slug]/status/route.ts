import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { normalizeSchedule,storeOpenState,storeOpeningMode,storeTimeZone } from '@/lib/schedule';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>160)return new Response(null,{status:404});
 const org=await prisma.organization.findUnique({where:{slug},select:{storeStatus:true,settings:true,status:true}});
 if(!org||org.status==='CANCELLED')return new Response(null,{status:404});
 const settings=org.settings as Record<string,unknown>|null,mode=storeOpeningMode(settings,org.storeStatus);
 return NextResponse.json({mode,openState:storeOpenState(org.storeStatus,normalizeSchedule(settings?.openingHours),undefined,mode,storeTimeZone(settings))},{headers:{'Cache-Control':'no-store'}});
}

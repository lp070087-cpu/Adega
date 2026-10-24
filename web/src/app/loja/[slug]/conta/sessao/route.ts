import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { portalReady,portalSession } from '@/lib/customer-portal/server';
import { growthState } from '@/lib/growth';
import { readAddressGeo } from '@/lib/customer-portal/address-geo';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;const enabled=await portalReady(),account=enabled?await portalSession(slug):null;
 const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
 if(!account)return NextResponse.json({enabled,account:null},{headers});
 const [addresses,org]=await Promise.all([prisma.customerPortalAddress.findMany({where:{accountId:account.id,account:{organizationId:account.organizationId}},orderBy:[{isDefault:'desc'},{createdAt:'desc'}],take:20}),prisma.organization.findUnique({where:{id:account.organizationId},select:{settings:true}})]);
 const geo=await readAddressGeo(addresses.map(a=>a.id));
 return NextResponse.json({enabled,account:{firstName:account.firstName,email:account.email,phone:account.phone},addresses:addresses.map(({accountId,createdAt,updatedAt,...address})=>({...address,latitude:geo[address.id]?.latitude??null,longitude:geo[address.id]?.longitude??null,reference:geo[address.id]?.reference??null})),pointsEnabled:growthState(org?.settings).loyalty.enabled},{headers});
}

'use client';
import { useState } from 'react';
import type { IntegrationProvider } from '@prisma/client';
import { IntegrationControls } from './IntegrationControls';
export function IntegrationSetup({organizations,provider}:{organizations:{id:string;name:string}[];provider:IntegrationProvider}){
 const [organizationId,setOrganizationId]=useState('');
 return <details style={{marginTop:20,borderTop:'1px solid #e1e6ec',paddingTop:12}}><summary>Configurar estabelecimento</summary><label style={{display:'grid',gap:8,fontSize:13}}>Estabelecimento<select value={organizationId} onChange={e=>setOrganizationId(e.target.value)} style={{padding:10,border:'1px solid #d5dde6',borderRadius:6,width:'100%'}}><option value="">Selecione uma organização</option>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>{organizationId&&<IntegrationControls key={`${provider}:${organizationId}`} organizationId={organizationId} provider={provider}/>}</details>;
}

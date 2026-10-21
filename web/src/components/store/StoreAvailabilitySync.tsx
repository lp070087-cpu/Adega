'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export function announceStoreAvailability(slug:string){if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel(`store-availability:${slug}`);channel.postMessage('refresh');channel.close();}}
export function StoreAvailabilitySync({slug,initialState,mode}:{slug:string;initialState:string;mode:string}){
 const router=useRouter();useEffect(()=>{
   let busy=false,closed=false;const controller=new AbortController();
   const check=async()=>{if(busy||document.visibilityState==='hidden')return;busy=true;try{const response=await fetch(`/api/loja/${encodeURIComponent(slug)}/status`,{cache:'no-store',signal:controller.signal});if(!response.ok)return;const data=await response.json();if(!closed&&(data.openState!==initialState||data.mode!==mode))router.refresh();}catch{}finally{busy=false;}};
   const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel(`store-availability:${slug}`);if(channel)channel.onmessage=()=>void check();
   window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);const timer=window.setInterval(check,15000);
   return()=>{closed=true;controller.abort();window.clearInterval(timer);channel?.close();window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);};
 },[slug,initialState,mode,router]);return null;
}

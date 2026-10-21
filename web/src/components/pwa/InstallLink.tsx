'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
export function InstallLink({href,children}:{href:string;children:React.ReactNode}) {
  const [installed,setInstalled]=useState(false);
  useEffect(()=>{const media=window.matchMedia('(display-mode: standalone)');const update=()=>setInstalled(media.matches||Boolean((navigator as Navigator&{standalone?:boolean}).standalone));update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  return installed?null:<Link data-install-main="true" href={href} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand">{children}</Link>;
}

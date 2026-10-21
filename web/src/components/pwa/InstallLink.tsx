'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import { observeInstalledContext } from '@/lib/pwa-install-state';
export function InstallLink({href,children}:{href:string;children:React.ReactNode}) {
  const [installed,setInstalled]=useState(false);
  useEffect(() => observeInstalledContext(window, navigator, setInstalled), []);
  return installed?null:<Link data-install-main="true" href={href} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand">{children}</Link>;
}

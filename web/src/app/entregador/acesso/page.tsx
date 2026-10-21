import {DriverAccessForm} from '@/components/driver/DriverAccessForm';
import {driverMailReady} from '@/lib/auth/driver-access';
export const metadata={title:'Acesso individual do entregador',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export const dynamic='force-dynamic';
export default function DriverAccessPage(){return <main className="flex min-h-screen items-center justify-center bg-ink-50 p-4"><section className="w-full min-w-0 max-w-md rounded-xl bg-white p-5 shadow-sm sm:p-8"><DriverAccessForm mailReady={driverMailReady()}/></section></main>;}

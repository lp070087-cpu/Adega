import {DriverAuthCard} from '@/components/driver/DriverAuthCard';
import {DriverEntry} from '@/components/driver/DriverEntry';
import {driverMailReady} from '@/lib/auth/driver-access';
export const metadata={title:'Primeiro acesso do entregador',robots:{index:false,follow:false},referrer:'same-origin' as const};
export const dynamic='force-dynamic';
export default function DriverAccessPage(){return <DriverAuthCard><DriverEntry mailReady={driverMailReady()} initialMode="access"/></DriverAuthCard>;}

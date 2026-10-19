import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LoginForm } from './LoginForm';
import '../platform.css';
export const dynamic='force-dynamic';
export default function AdminLogin(){if(process.env.PLATFORM_ADMIN_ENABLED!=='true')notFound();return <main className="platform-login"><section className="platform-login-card"><h1>Adega Plataforma</h1><p>Acesso exclusivo para operadores autorizados.</p><LoginForm/><Link href="/login">Acessar como estabelecimento</Link></section></main>;}

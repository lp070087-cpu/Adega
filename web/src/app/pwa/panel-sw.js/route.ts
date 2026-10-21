import { networkOnlyWorker } from '@/lib/pwa';

export function GET() {
  return new Response(networkOnlyWorker('/app', 'o painel do estabelecimento'), { headers: {
    'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache',
    'Service-Worker-Allowed': '/app/', 'X-Content-Type-Options': 'nosniff',
  } });
}

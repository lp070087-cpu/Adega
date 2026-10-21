/* Network only: never stores sessions, orders, customer data, API responses or writes. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !/^\/entregador(?:\/|$)/.test(url.pathname)) return;
  event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => new Response(
    '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem conexão</title><main style="font:16px system-ui;max-width:460px;margin:12vh auto;padding:24px"><h1>Você está sem conexão</h1><p>Reconecte para consultar ou atualizar entregas. Nenhuma alteração foi enviada.</p><a href="/entregador">Tentar novamente</a></main></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  )));
});

import type { MetadataRoute } from 'next';

export function storeAppPath(slug: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 160) throw new Error('Loja inválida.');
  return `/loja/${slug}`;
}

export function customerManifest(store: { slug: string; name: string; brandColor: string }): MetadataRoute.Manifest {
  const path = storeAppPath(store.slug);
  return {
    id: path, name: store.name, short_name: store.name.slice(0, 24),
    description: `Catálogo, pedidos e benefícios de ${store.name}.`,
    start_url: `${path}/`, scope: `${path}/`, display: 'standalone', lang: 'pt-BR',
    background_color: '#ffffff', theme_color: /^#[0-9a-f]{6}$/i.test(store.brandColor) ? store.brandColor : '#F15A24',
    icons: [192, 512].map(size => ({ src: `/pwa/customer-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })),
  };
}

/** No cache or background writes: authenticated data is never persisted by this worker. */
export function networkOnlyWorker(base: string, title: string): string {
  if (!/^\/(?:app|loja\/[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(base)) throw new Error('Escopo inválido.');
  const offline = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem conexão</title><main style="font:16px system-ui;max-width:460px;margin:12vh auto;padding:24px"><h1>Você está sem conexão</h1><p>Reconecte para consultar ${title}. Nenhuma alteração foi enviada.</p><a href="${base}">Tentar novamente</a></main></html>`;
  return `const base=${JSON.stringify(base)};
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||request.mode!=='navigate')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin||(url.pathname!==base&&!url.pathname.startsWith(base+'/')))return;
 event.respondWith(fetch(request,{cache:'no-store'}).catch(()=>new Response(${JSON.stringify(offline)},{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
});`;
}

import { whatsappHref } from '@/lib/whatsapp';
import * as React from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * SOBRE E CONTATO
 * -----------------------------------------------------------------------
 * REGRA DESTA SEÇÃO: só aparece a linha que TEM dado.
 *
 * "Telefone: —" é pior do que não ter telefone: o cliente conclui que a
 * loja não atende, em vez de entender que aquele campo não foi preenchido.
 * Por isso cada linha é condicional — não existe componente de "linha
 * vazia" aqui.
 *
 * O mesmo vale para a seção inteira: loja sem nenhum dado de contato e sem
 * descrição não mostra "Sobre" vazio. A seção é OMITIDA.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type StoreContactData = {
  name: string;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  openingHours: string | null;
  averageDeliveryTime: number | null;
  minimumOrder: number;
  /** Formatado no servidor para não depender de Intl no cliente. */
  minimumOrderLabel: string;
};

/** Uma linha de dado. Só é chamada quando o valor existe. */
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2 py-1.5 text-[0.84rem]">
      <dt className="font-semibold text-ink-500">{label}:</dt>
      <dd className="text-ink-800">{children}</dd>
    </div>
  );
}

export function StoreAbout({ store }: { store: StoreContactData }) {
  const fullAddress = [store.address, store.district, store.city, store.state]
    .filter((part) => part && String(part).trim())
    .join(' · ');

  const hasContact = Boolean(
    store.phone || store.whatsapp || store.email || fullAddress || store.openingHours,
  );
  const hasAnything = hasContact || Boolean(store.description?.trim());

  // Nada a dizer: a seção não existe. Uma âncora "Sobre" que abre um bloco
  // vazio faz o cliente procurar informação que não está lá.
  if (!hasAnything) return null;

  return (
    <section id="sobre" className="mx-auto max-w-[1180px] px-4 py-10 sm:px-5">
      <div className="rounded-xl border border-ink-100 bg-white p-5 sm:p-6">
        <h2 className="text-[1.05rem] font-extrabold text-ink-900">Sobre {store.name}</h2>

        {store.description?.trim() && (
          <p className="mt-2 max-w-3xl text-[0.86rem] leading-relaxed text-ink-600">
            {store.description}
          </p>
        )}

        {(store.averageDeliveryTime || store.minimumOrder > 0) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {store.averageDeliveryTime ? (
              <span className="rounded-full bg-ink-100 px-3 py-1 text-[0.74rem] font-semibold text-ink-700">
                🛵 Entrega em cerca de {store.averageDeliveryTime} min
              </span>
            ) : null}
            {store.minimumOrder > 0 ? (
              <span className="rounded-full bg-ink-100 px-3 py-1 text-[0.74rem] font-semibold text-ink-700">
                Pedido mínimo {store.minimumOrderLabel}
              </span>
            ) : null}
          </div>
        )}

        {hasContact && (
          <div id="contato" className="mt-5 border-t border-ink-100 pt-4">
            <h3 className="text-[0.9rem] font-extrabold text-ink-900">Contato e endereço</h3>
            <dl className="mt-1.5">
              {fullAddress ? <InfoRow label="Endereço">{fullAddress}</InfoRow> : null}
              {store.openingHours ? (
                <InfoRow label="Horário de funcionamento">{store.openingHours}</InfoRow>
              ) : null}
              {store.phone ? (
                <InfoRow label="Telefone">
                  <a className="hover:underline" href={`tel:${store.phone.replace(/\D/g, '')}`}>
                    {store.phone}
                  </a>
                </InfoRow>
              ) : null}
              {store.whatsapp ? (
                <InfoRow label="WhatsApp">
                  <a
                    className="hover:underline"
                    href={whatsappHref(store.whatsapp, `Olá! Vim pela loja ${store.name} no Del Flash.`) ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {store.whatsapp}
                  </a>
                </InfoRow>
              ) : null}
              {store.email ? (
                <InfoRow label="E-mail">
                  <a className="hover:underline" href={`mailto:${store.email}`}>
                    {store.email}
                  </a>
                </InfoRow>
              ) : null}
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}


/**
 * Rodapé da loja pública: atalhos para o que o cliente procura depois de
 * rolar a vitrine (cardápio, promoções, conta e pedidos) e o crédito discreto
 * da plataforma Del Flash. A cor de destaque é a da própria loja.
 */
export function StoreFooter({ store }: { store: { name: string; slug: string } }) {
  const links = [
    { href: '#cardapio', label: 'Cardápio' },
    { href: '#promocoes', label: 'Promoções' },
    { href: `/loja/${store.slug}/conta`, label: 'Minha conta' },
    { href: `/loja/${store.slug}/conta/pedidos`, label: 'Meus pedidos' },
  ];
  return (
    <footer className="mt-6 bg-[#0b1f3a] px-4 pb-10 pt-9 text-white sm:px-5">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[1.05rem] font-extrabold tracking-tight">{store.name}</p>
          <p className="mt-1 text-[0.78rem] text-white/60">Bebidas geladas com pedido online e entrega acompanhada.</p>
        </div>
        <nav aria-label="Rodapé" className="grid grid-cols-2 gap-x-6 gap-y-1 sm:flex sm:gap-2">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="flex min-h-11 items-center rounded-lg text-[0.82rem] font-semibold text-white/80 hover:text-white sm:px-3 sm:hover:bg-white/10">
              {link.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="mx-auto mt-6 flex max-w-[1180px] flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-[0.72rem] text-white/50">
        <span>Pedidos online com Del Flash</span>
        <a href="#inicio" className="inline-flex min-h-11 items-center font-semibold text-white/70 hover:text-white">Voltar ao topo ↑</a>
      </div>
    </footer>
  );
}

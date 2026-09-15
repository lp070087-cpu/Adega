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
                    href={`https://wa.me/${normalizeWhatsApp(store.whatsapp)}`}
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

function normalizeWhatsApp(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

/**
 * Rodapé da loja pública.
 *
 * O crédito da plataforma fica de fora por enquanto: a marca da plataforma
 * ainda não está definida, e inventar um nome aqui faria toda loja da base
 * exibir uma marca que não existe. Quando houver branding definido, é uma
 * linha a acrescentar.
 */
export function StoreFooter({ store }: { store: { name: string; slug: string } }) {
  return (
    <footer className="border-t border-ink-100 bg-white px-4 py-8 sm:px-5">
      <div className="mx-auto flex max-w-[1180px] flex-col items-center gap-2 text-center">
        <p className="text-[0.84rem] font-bold text-ink-800">{store.name}</p>
        <p className="text-[0.72rem] text-ink-400">
          Cardápio e pedidos online · /loja/{store.slug}
        </p>
        <a
          href="#inicio"
          className="mt-1 text-[0.74rem] font-semibold text-ink-500 hover:text-ink-800"
        >
          Voltar ao topo
        </a>
      </div>
    </footer>
  );
}

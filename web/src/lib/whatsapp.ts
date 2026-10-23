/**
 * Número no formato do link wa.me (DDI 55 + DDD + número), ou null.
 *
 * O WhatsApp da loja é gravado com DDI (12–13 dígitos); telefones de clientes
 * e entregadores, sem DDI (10–11). Decidir pelo comprimento evita confundir o
 * DDD 55 (RS) com o DDI do Brasil.
 */
export function whatsappDigits(value: string | null | undefined): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;
  return null;
}

/** Link wa.me com mensagem pré-preenchida opcional, ou null se o número for inválido. */
export function whatsappHref(value: string | null | undefined, text?: string): string | null {
  const digits = whatsappDigits(value);
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * TEXTO POR SEGMENTO — portado de loja-data.js (BUSINESS_COPY)
 * -----------------------------------------------------------------------
 * Fonte ÚNICA das frases da loja pública. O nome do estabelecimento vem
 * sempre do banco (Organization.name); aqui mora só o que depende do
 * segmento. Nenhuma frase fixa deve ser espalhada pelos componentes.
 * ═══════════════════════════════════════════════════════════════════════
 */

import type { BusinessType } from '@prisma/client';

export type BusinessCopy = {
  /** Como chamamos o negócio: "hamburgueria", "loja de bebidas". */
  noun: string;
  /** Frase do hero. O trecho entre *asteriscos* é o destaque. */
  headline: string;
  /** Descrição usada quando a loja ainda não escreveu a sua. */
  description: string;
};

export const BUSINESS_COPY: Record<BusinessType, BusinessCopy> = {
  BEVERAGE: {
    noun: 'loja de bebidas',
    headline: 'suas *bebidas* favoritas agora online',
    description: 'Bebidas geladas, destilados e gelo entregues na sua porta.',
  },
  BURGER: {
    noun: 'hamburgueria',
    headline: 'seu *lanche* favorito agora online',
    description: 'Hambúrguer artesanal, porções e bebidas geladas com entrega rápida.',
  },
  SNACK_BAR: {
    noun: 'lanchonete',
    headline: 'seu *lanche* favorito agora online',
    description: 'Lanches, salgados e café fresquinho entregues rapidinho.',
  },
  PIZZA: {
    noun: 'pizzaria',
    headline: 'sua *pizza* favorita agora online',
    description: 'Pizzas artesanais assadas na hora e entregues quentinhas.',
  },
  ACAI: {
    noun: 'açaiteria',
    headline: 'seu *açaí* favorito agora online',
    description: 'Açaí cremoso com os complementos que você escolher.',
  },
  RESTAURANT: {
    noun: 'restaurante',
    headline: 'sua *comida* favorita agora online',
    description: 'Pratos preparados na hora e entregues na sua porta.',
  },
  CONVENIENCE: {
    noun: 'conveniência',
    headline: 'tudo o que você *precisa* agora online',
    description: 'Bebidas, snacks e itens do dia a dia com entrega rápida.',
  },
  BAKERY: {
    noun: 'padaria',
    headline: 'seu *pão* fresquinho agora online',
    description: 'Pães, salgados e doces saídos do forno, entregues fresquinhos.',
  },
  MARKET: {
    noun: 'mercado',
    headline: 'tudo o que você *precisa* agora online',
    description: 'Hortifruti, mercearia, açougue e bebidas na sua porta.',
  },
  DARK_KITCHEN: {
    noun: 'cozinha',
    headline: 'sua *comida* favorita agora online',
    description: 'Pratos autorais preparados na hora, só para delivery.',
  },
};

/** Segmento ainda não definido (loja recém-criada). */
export const COPY_GENERIC: BusinessCopy = {
  noun: 'loja',
  headline: 'tudo o que você *procura* agora online',
  description: 'Peça online e receba com entrega rápida.',
};

export function copyByType(type: BusinessType | null | undefined): BusinessCopy {
  if (!type) return COPY_GENERIC;
  return BUSINESS_COPY[type] ?? COPY_GENERIC;
}

export function segmentNoun(type: BusinessType | null | undefined): string {
  return copyByType(type).noun;
}

// ── utilidades de texto (mesmas regras do loja-data.js) ────────────────

/** Escapa texto para interpolação segura em HTML/atributo. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Headline do hero: "<Nome da loja>, <frase do segmento>".
 * A loja sem nome cadastrado recebe só a frase — nunca "<vazio>, ...".
 * O destaque vira <em>, por isso o retorno é marcado como HTML confiável
 * (as duas entradas passam por escapeHtml antes de compor).
 */
export function heroHeadline(
  storeName: string | null | undefined,
  type: BusinessType | null | undefined,
): string {
  const copy = copyByType(type);
  const phrase = copy.headline.replace(/\*(.+?)\*/g, '<em>$1</em>');
  const name = escapeHtml(String(storeName ?? '').trim());
  if (!name) return phrase.charAt(0).toUpperCase() + phrase.slice(1);
  return `${name}, ${phrase}`;
}

/** Descrição do hero: a da loja, ou a do segmento. */
export function heroDescription(store: {
  description?: string | null;
  businessType?: BusinessType | null;
}): string {
  return store.description?.trim() || copyByType(store.businessType).description;
}

// ── iniciais do nome (avatar quando não há logo) ───────────────────────
/**
 * Regra GENÉRICA, sem tratamento especial para nenhum estabelecimento:
 *   "Burger do Zé"           → BZ   (ignora "do")
 *   "Mercado Central"        → MC
 *   "Pizza Prime"            → PP
 *   "João Lanches"           → JL
 *   "Distribuidora Imperial" → DI
 *   "Conveniência 24 Horas"  → C24  (regra do número: inicial + número)
 *   "Loja 24h"               → L24
 *   nome vazio               → LO   (marca neutra, não de uma loja)
 */
const STOP_WORDS = ['do', 'da', 'de', 'dos', 'das', 'e'];

export function initialsFromName(name: string | null | undefined): string {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return 'LO';

  const meaningful = parts.filter((p) => !STOP_WORDS.includes(p.toLowerCase()));
  const base = meaningful.length > 0 ? meaningful : parts;

  const withNumber = base.find((p) => /\d/.test(p));
  if (withNumber && base.length > 1) {
    const digits = String(withNumber).replace(/\D/g, '');
    return (base[0]![0]! + digits).toUpperCase().substring(0, 3);
  }
  if (base.length === 1) return base[0]!.substring(0, 2).toUpperCase();
  return (base[0]![0]! + base[base.length - 1]![0]!).toUpperCase();
}

// ── status da loja ─────────────────────────────────────────────────────

export type StoreStatusValue = 'OPEN' | 'CLOSED' | 'PAUSED';

export const STORE_STATUS_LABEL: Record<StoreStatusValue, string> = {
  OPEN: 'Aberta',
  CLOSED: 'Fechada',
  PAUSED: 'Pausada',
};

// ── rótulos de enums (PT-BR) usados na interface ───────────────────────

export const ORDER_STATUS_LABEL: Record<string, string> = {
  NEW: 'Novo',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Em preparo',
  READY: 'Pronto',
  WAITING_DRIVER: 'Aguardando entregador',
  DISPATCHED: 'Em rota',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
};

export const ORDER_SOURCE_LABEL: Record<string, string> = {
  OWN_STORE: 'Loja própria',
  IFOOD: 'iFood',
  FOOD99: '99Food',
  ZE_DELIVERY: 'Zé Delivery',
  WHATSAPP: 'WhatsApp',
  COUNTER: 'Balcão',
  MANUAL: 'Manual',
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'PIX',
  CREDIT_CARD: 'Crédito',
  DEBIT_CARD: 'Débito',
  ONLINE: 'Online',
  OTHER: 'Outro',
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  FAILED: 'Falhou',
  REFUNDED: 'Estornado',
};

export const DRIVER_STATUS_LABEL: Record<string, string> = {
  OFFLINE: 'Offline',
  ONLINE: 'Disponível',
  BUSY: 'Em entrega',
  RETURNING: 'Retornando',
};

export const VEHICLE_TYPE_LABEL: Record<string, string> = {
  MOTORCYCLE: 'Moto',
  CAR: 'Carro',
  BICYCLE: 'Bicicleta',
  ON_FOOT: 'A pé',
};

export const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  ATTENDANT: 'Atendente',
  KITCHEN: 'Cozinha',
  DISPATCHER: 'Expedição',
  DRIVER: 'Entregador',
  PLATFORM_ADMIN: 'Administrador da plataforma',
};

export const TRANSACTION_TYPE_LABEL: Record<string, string> = {
  SALE: 'Venda',
  SUPPLY: 'Suprimento',
  WITHDRAWAL: 'Sangria',
  REFUND: 'Estorno',
  ADJUSTMENT: 'Ajuste',
};

export const INVENTORY_MOVEMENT_LABEL: Record<string, string> = {
  IN: 'Entrada',
  OUT: 'Saída',
  ADJUSTMENT: 'Ajuste',
  SALE: 'Venda',
  CANCELLATION: 'Cancelamento',
};

export const DELIVERY_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Aguardando',
  ASSIGNED: 'Atribuída',
  PICKED_UP: 'Retirada',
  IN_TRANSIT: 'Em rota',
  ARRIVED: 'No cliente',
  DELIVERED: 'Entregue',
  FAILED: 'Falhou',
};

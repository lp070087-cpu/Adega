import type { Role } from '@prisma/client';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PERMISSÕES — porta única de autorização
 * -----------------------------------------------------------------------
 * Toda verificação de acesso passa por `can(role, permission)`. Espalhar
 * `role === 'OWNER'` pelos componentes é o caminho mais curto para uma
 * brecha; aqui a matriz fica num lugar só, auditável e testável.
 *
 * IMPORTANTE: `can()` sozinho NÃO protege um server action. Ele precisa
 * sempre vir acompanhado de requireOrg(), que é quem garante que o
 * organizationId veio da sessão e não do cliente.
 * ═══════════════════════════════════════════════════════════════════════
 */

export const PERMISSIONS = [
  'VIEW_DASHBOARD',
  'MANAGE_PRODUCTS',
  'MANAGE_ORDERS',
  'MANAGE_DRIVERS',
  'MANAGE_CASH',
  'VIEW_REPORTS',
  'MANAGE_TEAM',
  'MANAGE_SETTINGS',
  'MANAGE_INTEGRATIONS',
  'VIEW_CUSTOMERS',
  'MANAGE_STOCK',
  'USE_DRIVER_APP',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Papéis operacionais (PLATFORM_ADMIN é tratado à parte). */
type TenantRole = Exclude<Role, 'PLATFORM_ADMIN'>;

const ALL: Permission[] = [...PERMISSIONS];

/**
 * Matriz de acesso.
 *
 * OWNER/ADMIN  → tudo
 * MANAGER      → toda a operação, sem mexer em integrações nem na equipe
 * ATTENDANT    → pedidos, clientes, caixa
 * KITCHEN      → pedidos (preparo)
 * DISPATCHER   → entregadores e expedição
 * DRIVER       → apenas a própria área
 */
const ROLE_PERMISSIONS: Record<TenantRole, Permission[]> = {
  OWNER: ALL,
  ADMIN: ALL,

  MANAGER: [
    'VIEW_DASHBOARD',
    'MANAGE_PRODUCTS',
    'MANAGE_ORDERS',
    'MANAGE_DRIVERS',
    'MANAGE_CASH',
    'VIEW_REPORTS',
    'VIEW_CUSTOMERS',
    'MANAGE_STOCK',
  ],

  ATTENDANT: [
    'VIEW_DASHBOARD',
    'MANAGE_ORDERS',
    'MANAGE_CASH',
    'VIEW_CUSTOMERS',
  ],

  KITCHEN: ['MANAGE_ORDERS'],

  DISPATCHER: ['VIEW_DASHBOARD', 'MANAGE_ORDERS', 'MANAGE_DRIVERS'],

  DRIVER: ['USE_DRIVER_APP'],
};

/**
 * PLATFORM_ADMIN opera a plataforma (gestão de tenants), não a loja.
 * Por isso não recebe automaticamente os poderes de OWNER.
 */
const PLATFORM_ADMIN_PERMISSIONS: Permission[] = ['VIEW_DASHBOARD', 'VIEW_REPORTS'];

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  if (role === 'PLATFORM_ADMIN') {
    return PLATFORM_ADMIN_PERMISSIONS.includes(permission);
  }
  const granted = ROLE_PERMISSIONS[role as TenantRole];
  if (!granted) return false;
  return granted.includes(permission);
}

/** Qualquer uma das permissões. */
export function canAny(role: Role | null | undefined, permissions: Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

/** Todas as permissões exigidas. */
export function canAll(role: Role | null | undefined, permissions: Permission[]): boolean {
  return permissions.every((p) => can(role, p));
}

/** Lista efetiva — usada para esconder itens de menu no servidor. */
export function permissionsOf(role: Role | null | undefined): Permission[] {
  if (!role) return [];
  if (role === 'PLATFORM_ADMIN') return [...PLATFORM_ADMIN_PERMISSIONS];
  return [...(ROLE_PERMISSIONS[role as TenantRole] ?? [])];
}

/** Papéis que podem despachar pedido para entregador. */
export function canDispatch(role: Role | null | undefined): boolean {
  return can(role, 'MANAGE_DRIVERS') || can(role, 'MANAGE_ORDERS');
}

/** Papéis que enxergam valores financeiros. */
export function canSeeMoney(role: Role | null | undefined): boolean {
  return can(role, 'VIEW_REPORTS') || can(role, 'MANAGE_CASH');
}

/** Hierarquia para impedir que alguém rebaixe/expulse um superior. */
const ROLE_RANK: Record<Role, number> = {
  OWNER: 100,
  ADMIN: 90,
  MANAGER: 70,
  ATTENDANT: 50,
  KITCHEN: 40,
  DISPATCHER: 40,
  DRIVER: 10,
  PLATFORM_ADMIN: 100,
};

export function outranks(actor: Role, target: Role): boolean {
  return ROLE_RANK[actor] > ROLE_RANK[target];
}

export function roleRank(role: Role): number {
  return ROLE_RANK[role];
}

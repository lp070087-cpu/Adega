import type { OrderStatus } from '@prisma/client';

/**
 * Status em que um pedido COM entregador conta como entrega ativa dele.
 * A loja pode atribuir já no aceite ou na separação: o pedido aparece no app
 * como "aguardando liberação" e vira "pronto para retirada" quando a loja
 * libera (WAITING_DRIVER). Sem driverId, nenhum destes entra na conta.
 */
export const DRIVER_ACTIVE_STATUSES: OrderStatus[] = ['CONFIRMED', 'PREPARING', 'READY', 'WAITING_DRIVER', 'DISPATCHED'];
export const DRIVER_ACTIVE_SQL = `'CONFIRMED','PREPARING','READY','WAITING_DRIVER','DISPATCHED'`;

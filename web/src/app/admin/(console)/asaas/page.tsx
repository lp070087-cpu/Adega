import { notFound } from 'next/navigation';

/**
 * O Asaas saiu da plataforma (nem assinaturas, nem pedidos). A rota fica
 * só para links antigos responderem "não encontrado".
 */
export default function AsaasPage() {
  notFound();
}

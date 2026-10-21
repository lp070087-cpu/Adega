import { createHmac, timingSafeEqual } from 'node:crypto';
export function validWebhookSignature(raw: string, signature: string | null, secret: string | undefined) {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature.slice(7),'hex'),createHmac('sha256',secret).update(raw).digest());
}
export function sameSecret(a: string | null, b: string | undefined) {
  if (!a || !b) return false;
  const first=Buffer.from(a),second=Buffer.from(b);
  return first.length===second.length && timingSafeEqual(first,second);
}

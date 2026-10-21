type Availability = { available:boolean; trackStock:boolean; stock:number };
type Product = Availability & { combo: null | { items:Array<{ quantity:number; product:Availability & { organizationId:string; active:boolean; combo?:{id:string}|null } }> } };

/** Presentation derived from the same physical component balances checked at checkout. */
export function storeProductAvailability(product: Product, organizationId:string): Availability {
  if(!product.combo) return {available:product.available,trackStock:product.trackStock,stock:product.stock};
  const items=product.combo.items;
  if(!items.length || items.some(item=>item.product.organizationId!==organizationId || !item.product.active || !item.product.available || item.product.combo || !Number.isSafeInteger(item.quantity) || item.quantity<1)) return {available:false,trackStock:true,stock:0};
  const limits=items.filter(item=>item.product.trackStock).map(item=>Math.floor(item.product.stock/item.quantity));
  if(product.trackStock) limits.push(product.stock);
  return {available:product.available,trackStock:limits.length>0,stock:limits.length?Math.max(0,Math.min(...limits)):product.stock};
}

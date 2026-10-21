import type { AssistantProduct } from './catalog';
import { storeProductAvailability } from '../store-product-availability';

type Source = {
  id:string; name:string; type?:string; price:unknown; promotionalPrice:unknown;
  stock:number; trackStock:boolean; available:boolean;
  globalProduct?:{brand?:string|null;packSize?:number|null;volume?:unknown;unit?:string|null}|null;
  variations?:Array<{id:string;productId:string;name:string;priceAdjustment:unknown;active:boolean}>;
  combo?:{items:Array<{quantity:number;product:{organizationId:string;active:boolean;available:boolean;trackStock:boolean;stock:number;combo?:{id:string}|null}}> }|null;
};

/** IDs de seleção não são URLs: a variante sempre aponta para seu produto real. */
export function assistantCatalogEntries(products:Source[], organizationId:string):AssistantProduct[] {
  return products.flatMap(product => {
    const availability = storeProductAvailability({...product,combo:product.combo ?? null},organizationId);
    if (!availability.available || (availability.trackStock && availability.stock <= 0)) return [];
    const base = { id:product.id,name:product.name,price:Number(product.price),promotionalPrice:product.promotionalPrice==null?null:Number(product.promotionalPrice),...availability,brand:product.globalProduct?.brand,packSize:product.globalProduct?.packSize,volume:product.globalProduct?.volume?Number(product.globalProduct.volume):null,unit:product.globalProduct?.unit };
    const variations = (product.variations ?? []).filter(v=>v.active && v.productId===product.id);
    if (!variations.length) return product.type === 'VARIATION' ? [] : [base];
    const options = variations.flatMap(variation=>{
      // Checkout soma o ajuste à promoção vigente, ou ao preço normal.
      const price = Math.round(((base.promotionalPrice ?? base.price)+Number(variation.priceAdjustment))*100)/100;
      if (!Number.isFinite(price) || price < 0) return [];
      return [{...base,id:`variation:${variation.id}`,productId:product.id,variationId:variation.id,variationName:variation.name,price,promotionalPrice:null,packSize:null,volume:null,unit:null}];
    });
    return product.type === 'VARIATION' ? options : [base,...options];
  });
}

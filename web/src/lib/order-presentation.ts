/** Legacy database states remain intact; delivery preparation has one public stage. */
export function operationalStatus(status:string,deliveryType?:string){
 if(status==='WAITING_DRIVER'||(status==='READY'&&deliveryType!=='PICKUP'))return 'PREPARING';
 return status;
}
export function operationalLabel(status:string,deliveryType?:string){return ({NEW:'Novo',CONFIRMED:'Aceito',PREPARING:'Separando',READY:'Pronto para retirada',DISPATCHED:'Saiu para entrega',DELIVERED:'Finalizado',CANCELLED:'Cancelado'} as Record<string,string>)[operationalStatus(status,deliveryType)]??status;}

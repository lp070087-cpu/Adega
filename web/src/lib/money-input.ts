/** Keep editing as a string; blank stays blank. Only parse at a calculation/submit boundary. */
export function parseMoneyInput(input:string):number|null{
 const value=input.trim().replace(/^R\$\s*/, '').replace(/\s/g,'');if(!value)return null;
 if(value.includes(',')&&!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{0,2}$/.test(value))return null;
 const normalized=value.includes(',')?value.replace(/\./g,'').replace(',','.'):/^\d{1,3}(?:\.\d{3})+$/.test(value)?value.replace(/\./g,''):value;
 if(!/^\d+(?:\.\d{0,2})?$/.test(normalized))return null;
 const number=Number(normalized);return Number.isFinite(number)?Math.round(number*100)/100:null;
}
export function formatMoneyInput(input:string):string{
 if(!input.trim())return '';
 const value=parseMoneyInput(input);return value===null?input:value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}

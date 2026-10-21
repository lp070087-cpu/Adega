'use client';
import {useEffect,useState} from 'react';
import {MoneyInput} from '@/components/ui';
import {formatMoneyInput} from '@/lib/money-input';

/** Form-owned currency text: preserve editing; normalize only on blur. */
export function CurrencyField({defaultValue='',...props}:Omit<React.InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'|'type'>){
 const [value,setValue]=useState(()=>formatMoneyInput(String(defaultValue)));
 useEffect(()=>setValue(formatMoneyInput(String(defaultValue))),[defaultValue]);
 return <MoneyInput {...props} type="text" value={value} onChange={event=>setValue(event.target.value)} onBlur={event=>{setValue(formatMoneyInput(event.target.value));props.onBlur?.(event);}}/>;
}

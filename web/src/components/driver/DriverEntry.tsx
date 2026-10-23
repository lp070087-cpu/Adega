'use client';
import {useCallback,useState} from 'react';
import {DriverLoginForm} from './DriverLoginForm';
import {DriverAccessForm} from './DriverAccessForm';

/** Tela única do entregador: entrar, ou criar/redefinir a senha por código. */
export function DriverEntry({store,mailReady,initialMode='login'}:{store?:string;mailReady:boolean;initialMode?:'login'|'access'}){
 const [mode,setMode]=useState(initialMode);
 const back=useCallback(()=>setMode('login'),[]);
 return mode==='login'?<DriverLoginForm store={store} onFirstAccess={()=>setMode('access')}/>:<DriverAccessForm store={store} mailReady={mailReady} onBack={back}/>;
}

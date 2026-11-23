"use client";
import {useEffect,useState,type ReactNode} from 'react';
import ActionToast from './action-toast';
/** Adapts existing result messages without changing the form's data. */
export default function ActionNotice({children,type='error',actions,onClose,autoCloseMs}:{children:string|null|undefined;type?:'error'|'success';actions?:ReactNode;onClose?:()=>void;autoCloseMs?:number}){
 const message=children || '';
 const [dismissed,setDismissed]=useState<string|null>(null);
 useEffect(()=>{setDismissed(null);},[message,type]);
 return <ActionToast message={dismissed===message?'':message} type={type} actions={actions} autoCloseMs={autoCloseMs} onClose={()=>{setDismissed(message);onClose?.();}}/>;
}

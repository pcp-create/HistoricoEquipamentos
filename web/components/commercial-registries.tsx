"use client";
import {useState} from 'react';
import TaskTerritories from './task-territories';
import CustomerRegistry from './customer-registry';
export default function CommercialRegistries(){const [tab,setTab]=useState('division'),[opened,setOpened]=useState(false);return <><nav className="territory-sheet-toolbar" aria-label="Cadastros comerciais"><button className="button" aria-pressed={tab==='division'} onClick={()=>setTab('division')}>Divisão Comercial</button><button className="button" aria-pressed={tab==='customers'} onClick={()=>{setOpened(true);setTab('customers')}}>Clientes M8</button></nav><div hidden={tab!=='division'}><TaskTerritories/></div>{opened&&<div hidden={tab!=='customers'}><CustomerRegistry/></div>}</>}

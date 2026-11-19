'use client';
import {useEffect,useState} from 'react';
export default function WorkshopRentalWarning({visitId}:{visitId:string}) {
 const [orders,setOrders]=useState<{id:string;company:number;number:string;customer:string|null}[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError(false);setOrders([]);
  void fetch('/api/workshop?'+new URLSearchParams({exitWarning:visitId}),{cache:'no-store',signal:controller.signal})
   .then(async response=>{if(!response.ok)throw Error();return response.json();})
   .then(data=>setOrders(data.orders))
   .catch(()=>{if(!controller.signal.aborted)setError(true);})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return ()=>controller.abort();
 },[visitId]);
 if(loading)return <p role="status">Verificando OSs de locação em aberto…</p>;
 if(error)return <p className="ws-warning" role="alert">Não foi possível consultar as OSs de locação. Confira no M8. Isso não impede registrar a saída.</p>;
 if(!orders.length)return null;
 return <div className="ws-warning" role="status"><div><strong>Existe OS de locação em aberto para este equipamento.</strong>
 <ul>{orders.map(order=><li key={`${order.company}:${order.id}`}>OS {order.number} · Empresa {order.company}{order.customer?` · ${order.customer}`:''}</li>)}</ul>
 <p>Após a saída, a OS pendente poderá voltar a definir o equipamento como locado. Este aviso não impede a saída nem encerra a OS.</p></div></div>;
}

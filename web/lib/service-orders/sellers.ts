import 'server-only';
import {m8Session} from './m8';
type Api=Awaited<ReturnType<typeof m8Session>>;
export async function orderSellers(api:Api){
 const rows=await api('/v1/configuracoes/vendedor?Page=0&PageSize=0');
 if(!Array.isArray(rows))throw Error('Consulta de vendedores indisponível.');
 return [...new Map(rows.filter(r=>Number.isSafeInteger(r.id)&&r.id>0&&r.id<=2147483647).map(r=>{
  const blocked=r.bloqueado===true||String(r.bloqueado).toLowerCase()==='sim';
  return [String(r.id),{id:String(r.id),name:r.razaoSocial||r.nomeFantasia||r.fantasia||r.apelido||String(r.id),disabled:r.ativo===false||blocked,detail:r.ativo===false?'Inativo':blocked?'Bloqueado':`ID ${r.id}`}];
 })).values()].sort((a,b)=>Number(a.id)-Number(b.id));
}
export async function customerOrderSellers(api:Api,customer:string|number){
 const [catalog,links]=await Promise.allSettled([orderSellers(api),api(`/v1/configuracoes/cliente/${customer}/vendedor?Page=0&PageSize=0`)]);
 if(catalog.status==='rejected')throw catalog.reason;
 const linked=links.status==='fulfilled'&&Array.isArray(links.value)?links.value:[];
 const defaults=linked.filter(r=>r.padrao===true),chosen=defaults.length===1?defaults[0]:linked.length===1?linked[0]:null;
 const id=chosen?String(chosen.vendedorId):null;
 return {rows:catalog.value,defaultSellerId:catalog.value.some(r=>r.id===id&&!r.disabled)?id:null,...(links.status==='rejected'||!Array.isArray(links.value)?{warning:'Não foi possível consultar o vendedor padrão do cliente. Selecione o vendedor manualmente.'}:{})};
}

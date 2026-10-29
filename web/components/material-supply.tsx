import type {PurchaseBalance} from "@/lib/service-scheduling/purchase-balances";
import './material-supply.css';
const qty=(v:unknown)=>Number(v).toLocaleString('pt-BR',{maximumFractionDigits:3});
const day=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)?v.split('-').reverse().join('/'):v;
export default function MaterialSupply({supply,purchases}:{supply?:any;purchases?:PurchaseBalance}){
 return <div className="material-supply"><span>Estoque: <b>{supply?.stock!=null?`${qty(supply.stock)} ${supply.unit||''}`:'Não informado'}</b>{supply?.available!=null&&<> · Disponível: <b>{qty(supply.available)} {supply.unit}</b></>}</span>
 {purchases?.imported?<>{purchases.groups.length?purchases.groups.map((p,i)=><span key={i}>Em compra: <b>{qty(p.quantity)} {p.unit}</b> · Pedido(s): {p.orders.join(', ')}<span>Previsão: {[...new Set(p.deliveryDates.filter(Boolean))].length?p.deliveryDates.filter(Boolean).map(v=>day(v!)).join(', '):'Não informada'}</span></span>):<span>Em compra: {purchases.complete?'Nenhum saldo em aberto':'Aguardando atualização'}</span>}{!purchases.complete&&<span>Compras com importação parcial.</span>}</>:<span>Compras: ainda não consultadas.</span>}
 {supply?.stock_at&&<span className="material-supply-updated">Estoque atualizado em {new Date(supply.stock_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</span>}
 </div>;
}

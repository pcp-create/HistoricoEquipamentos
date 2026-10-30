import { SafeError } from '../utils/logger.js';
export type ContractCharge = {kind:'fixed'|'variable';id:string;customer:string;amount:number};
export type ContractInstallment = {period:string;number:number;total:number;amount:number;charges:ContractCharge[]};
export type ContractSchedule = {version:1;fixed:Record<string,unknown>[];variable:Record<string,unknown>[];installments:ContractInstallment[]};
const date=(value:unknown)=>{
 const day=typeof value==='string'?value.slice(0,10):'';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)throw new SafeError('Data inválida nas parcelas do contrato; snapshot anterior preservado');
 return day;
};
const month=(day:string)=>Number(day.slice(0,4))*12+Number(day.slice(5,7))-1;
const period=(n:number)=>`${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;
function cents(row:Record<string,unknown>){
 // total already includes quantity; valor is the unit price.
 const value=row.total??(row.valor!=null&&row.quantidade!=null?Number(row.valor)*Number(row.quantidade):null);
 if(value==null||value===''||!Number.isFinite(Number(value))||Number(value)<0)throw new SafeError('Valor inválido nas parcelas do contrato; snapshot anterior preservado');
 return Math.round(Number(value)*100);
}
export function contractSchedule(header:Record<string,unknown>,fixed:Record<string,unknown>[],variable:Record<string,unknown>[]):ContractSchedule {
 const buckets=new Map<number,ContractCharge[]>();
 const add=(index:number,row:Record<string,unknown>,kind:ContractCharge['kind'])=>{
  const charges=buckets.get(index)||[];
  charges.push({kind,id:String(row.id),customer:String(row.clienteId||header.pessoaId||''),amount:cents(row)/100});buckets.set(index,charges);
 };
 for(const row of fixed){
  const startDay=date(row.inicioFaturamento),endDay=date(row.finalFaturamento||header.final);
  const start=month(startDay),end=month(endDay);
  // A component ending before the contract ends has an exclusive cutoff.
  // The contract's last billing month remains included (e.g. 36 rental months).
  const intermediateEnd=!!header.final && endDay<date(header.final);
  if(end<start||end-start>1200)throw new SafeError('Intervalo inválido nas parcelas do contrato; snapshot anterior preservado');
  const frequency=row.periodicidadeFaturamento;
  const step=frequency==='Mensal'||frequency===0?1:frequency==='Anual'||frequency===1?12:null;
  if(step==null)throw new SafeError('Periodicidade de parcela não reconhecida; snapshot anterior preservado');
  for(let current=start;current<=end;current+=step){
   const label=period(current),lastDay=new Date(Date.UTC(Math.floor(current/12),current%12+1,0)).getUTCDate();
   const billingDay=`${label}-${String(Math.min(Number(startDay.slice(8)),lastDay)).padStart(2,'0')}`;
   if(intermediateEnd&&billingDay>=endDay)continue;
   add(current,row,'fixed');
  }
 }
 // Variable entries are individual charges on inicioFaturamento, never recurring.
 for(const row of variable)add(month(date(row.inicioFaturamento)),row,'variable');
 const months=[...buckets.keys()].sort((a,b)=>a-b);
 const installments=months.map((index,i)=>({period:period(index),number:i+1,total:months.length,amount:buckets.get(index)!.reduce((sum,row)=>sum+Math.round(row.amount*100),0)/100,charges:buckets.get(index)!}));
 return {version:1,fixed,variable,installments};
}

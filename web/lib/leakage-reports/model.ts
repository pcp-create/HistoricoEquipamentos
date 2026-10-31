import {calculateMachines} from '../../public/tools/leak-calculation.mjs';
export class LeakageInputError extends Error {}
export class LeakageConflict extends Error {}
export const leakageId=(v:unknown)=>{if(typeof v!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))throw new LeakageInputError('Identificador inválido.');return v;};
const text=(value:unknown,max:number)=>{if(typeof value!=='string'||value.length>max)throw new LeakageInputError('Texto inválido ou muito longo.');return value.trim();};
const number=(v:unknown,max:number,label:string)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<=0||v>max)throw new LeakageInputError(`Confira ${label}.`);return v;};
export function validateLeakage(raw:any){
 if(!raw||!Array.isArray(raw.machines)||!raw.machines.length||raw.machines.length>100)throw new LeakageInputError('Inclua de 1 a 100 máquinas consideradas no levantamento.');
 const document:any={version:1};
 for(const key of ['client','title','date','serviceOrder','inspector','location','notes'])document[key]=text(raw[key]??'',key==='notes'?10000:500);
 if(!document.client)throw new LeakageInputError('Informe o cliente.');
 document.title||='Caça vazamentos';
 if(document.date&&(!/^20\d{2}-\d{2}-\d{2}$/.test(document.date)||!Number.isFinite(Date.parse(document.date))||new Date(document.date).toISOString().slice(0,10)!==document.date))throw new LeakageInputError('Data inválida.');
 document.pressureBar=number(raw.pressureBar,100,'a pressão da rede em bar');
 document.energyPrice=number(raw.energyPrice,100,'o preço da energia em R$/kWh');
 document.machines=raw.machines.map((m:any)=>{
  if(!m||typeof m!=='object')throw new LeakageInputError('Máquina inválida.');
  const name=text(m.name??'',500);if(!name)throw new LeakageInputError('Identifique cada máquina considerada.');
  const hoursMode=m.hoursMode??'calculated';
  if(!['calculated','annual'].includes(hoursMode))throw new LeakageInputError('Selecione a forma de informar as horas anuais.');
  const hours=hoursMode==='annual'?{hoursMode,annualHoursInput:number(m.annualHoursInput,8784,'as horas anuais (máximo 8.784)'),hoursPerDay:null,daysPerYear:null}:{hoursMode,annualHoursInput:null,hoursPerDay:number(m.hoursPerDay,24,'as horas por dia'),daysPerYear:number(m.daysPerYear,366,'os dias por ano')};
  return {id:leakageId(m.id),name,equipmentId:m.equipmentId?String(m.equipmentId).replace(/[^0-9]/g,'').slice(0,18):'',powerKw:number(m.powerKw,100000,'a potência em kW'),flowM3min:number(m.flowM3min,100000,'a vazão em m³/min'),...hours};
 });
 if(new Set(document.machines.map((m:any)=>m.id)).size!==document.machines.length)throw new LeakageInputError('Máquinas com identificação repetida.');
 document.calculation=calculateMachines(document.machines);
 document.xml=text(raw.xml??'',2000000);
 document.settings={};
 for(const key of ['inspetorInput','serviceOrderInput','empresaInput','localizacaoInput','areaInput','edificioLocalInput','falhouMapInput','medidaMapInput','statusInput','responsavelInput'])document.settings[key]=text(raw.settings?.[key]??'',10000);
 if(!Array.isArray(raw.images??[])||(raw.images??[]).length>500)throw new LeakageInputError('Limite de 500 imagens por levantamento.');
 document.images=(raw.images??[]).map((i:any)=>({name:text(i.name,500),assetId:leakageId(i.assetId)}));
 document.clientLogo=raw.clientLogo?leakageId(raw.clientLogo):null;
 return document;
}

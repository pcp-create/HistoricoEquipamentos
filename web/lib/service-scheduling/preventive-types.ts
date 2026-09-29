export type PreventiveType = {m8Identifier:string;hours:number|null;months:number|null};
export function validatePreventiveTypes(raw:unknown):PreventiveType[]{
 if(raw===undefined)return [];
 if(!Array.isArray(raw)||raw.length>500)throw Error('Configuração de preventivas inválida.');
 const identifiers=new Set<string>();
 return raw.map(row=>{
  if(!row||typeof row.m8Identifier!=='string'||!row.m8Identifier.trim()||row.m8Identifier.length>500)throw Error('Selecione o tipo de atendimento da preventiva.');
  const m8Identifier=row.m8Identifier.trim();
  if(identifiers.has(m8Identifier))throw Error('Configure somente um intervalo por tipo de atendimento.');
  identifiers.add(m8Identifier);
  const hours=row.hours==null||row.hours===''?null:Number(row.hours),months=row.months==null||row.months===''?null:Number(row.months);
  if((hours!==null&&(!Number.isFinite(hours)||hours<0.001||hours>1000000))||(months!==null&&(!Number.isInteger(months)||months<1||months>1200))||(!hours&&!months))throw Error('Informe intervalo em horas e/ou meses para cada tipo de atendimento.');
  return {m8Identifier,hours,months};
 });
}

import owners from '../sales-projection/flow-owners.json';
export const flowStatusName=(schedule:{status_lancamento_nome?:string|null})=>schedule.status_lancamento_nome?.trim()||'Não informado';
export const flowResponsible=(schedule:{status_lancamento_nome?:string|null})=>(owners as Record<string,string>)[flowStatusName(schedule)]||'Outro';
export function flowResponsibleColor(name:string){
 const colors:Record<string,string>={Comercial:'#2879c7',Planejamento:'#7d68ad',Almoxarifado:'#228566',Compras:'#c27b20',Faturamento:'#167c88',Outro:'#71839a'};
 return colors[name]||colors.Outro;
}

/** One row per filtered machine, including rows on other pages and client groups. */
const preventiveStatus:Record<string,string>={overdue:'Vencida (estimativa)',due:'Limite atingido',soon:'Próximos 30 dias',incomplete:'Dados incompletos',scheduled:'Programada',none:'Sem plano'};
export function rentalExportRows(equipment:any[]) {
 return equipment.map(e=>({
  'Código':String(e.id??''),'ID interno':String(e.internal_code??''),'Equipamento':e.name||'',
  'Marca':e.brand||'','Modelo':e.model||'','Número de série':e.serial||'',
  'Situação':e.rentalStatus?.label||'',
  'Cliente':e.rentalStatus?.customer||(e.clients||[]).map((c:any)=>c.name||String(c.id)).join(', '),
  'Localização':e.rentalStatus?.workshop||e.workshop?.workshop||e.location||(e.rental?'RJ Compressores':''),
  'Início do contrato':e.rentalStatus?.contract?.start||'','Fim do contrato':e.rentalStatus?.contract?.end||'',
  'Vigência (dias)':e.rentalStatus?.contract?.duration??'','Condição do contrato':e.rentalStatus?.contract?.label||'',
  'Dias restantes':e.rentalStatus?.contract?.remaining??'',
  'Preventiva':e.forecast?.name||'','Situação da preventiva':preventiveStatus[e.forecast?.status]||'',
  'Previsão da preventiva':e.forecast?.due||'','ID da última OS':String(e.latest?.order_id||''),
  'Status da última OS':e.latest?.status||'','Tipo da última OS':e.latest?.tipo_nome||'',
  'Equipamento inativo':e.inactivation?'Sim':'Não','Motivo da inativação':e.inactivation?.reason||'',
 }));
}

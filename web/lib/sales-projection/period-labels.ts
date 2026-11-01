// Use the selected competence, rather than snapshot capture date, for historical wording.
export function projectionPeriodLabels(period:string,now=new Date()){
 const past=period<new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(now).slice(0,7);
 return {past,pending:past?'Saldo não realizado':'A faturar',gap:past?'Diferença para a meta':'A buscar da meta'};
}

export function projectionTargetGap(target:number,total:{projection:number;billed:number},past:boolean){
 return Math.max(0,Math.round((target-(past?total.billed:total.projection))*100)/100);
}

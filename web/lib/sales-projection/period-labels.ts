// Use the selected competence, rather than snapshot capture date, for historical wording.
export function projectionPeriodLabels(period:string,now=new Date()){
 const past=period<new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(now).slice(0,7);
 return {past,pending:past?'Saldo não realizado':'A faturar',gap:past?'Diferença para a meta':'A buscar da meta'};
}

export function projectionTargetGap(target:number,total:{projection:number;billed:number},past:boolean){
 return Math.max(0,Math.round((target-(past?total.billed:total.projection))*100)/100);
}

// Historical balance before returns: avoid presenting a reversal as an unbilled sale.
// Clamp per company so overperformance in one company does not hide another's balance.
export function pendingWithoutReturns(row:{projection:number;billed:number;returns:number;pending:number},past:boolean){
 return past?Math.max(0,Math.round((row.projection-row.billed-row.returns)*100)/100):row.pending;
}
export function totalPendingWithoutReturns(rows:Parameters<typeof pendingWithoutReturns>[0][],past:boolean){
 return Math.round(rows.reduce((sum,row)=>sum+pendingWithoutReturns(row,past),0)*100)/100;
}

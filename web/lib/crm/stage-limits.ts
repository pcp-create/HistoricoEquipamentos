export const crmStageDefinitions = {
 proposal: [
  ['creating','Em criação',true],['in_review','Em revisão',true],['reviewed','Revisada',true],
  ['sent','Enviada ao cliente',true],['converting','Criando OS',true],
  ['won','Concretizada',false],['not_selected','Outra proposta ganha',false],['lost','Perdida',false],['cancelled','Cancelada',false],
 ],
 opportunity: [
  ['prospecting','Prospecção',true],['qualification','Qualificação',true],['proposal','Proposta',true],
  ['negotiation','Negociação',true],['financial','Aprovação financeira',true],['closed','Encerrada',false],
  ['won','Ganha',false],['lost','Perdida',false],['cancelled','Cancelada',false],
 ],
} as const;
export type StageKind = keyof typeof crmStageDefinitions;
export type StageLimits = Record<string, number>;
export function stageKey(kind:StageKind,row:any):string {
 return kind==='opportunity' ? (row.status==='open'?row.commercial?.stage||'prospecting':row.status)
 : row.status==='pending'?row.workflow?.state||'creating':row.status;
}
export function monitoredStage(kind:StageKind,stage:string) {
 return crmStageDefinitions[kind].some(([key,,active])=>key===stage&&active);
}
export function stageLimit(kind:StageKind,row:any,limits:StageLimits) {
 if(kind==='proposal'&&row.opportunity_status&&row.opportunity_status!=='open')return null;
 const stage=stageKey(kind,row);
 return monitoredStage(kind,stage) ? limits[kind+':'+stage]??null : null;
}
export function stageOverdue(row:{stage_since?:string;stage_limit_minutes?:number|null},now=Date.now()) {
 const since=Date.parse(row.stage_since||'');
 return Number.isFinite(since)&&Number(row.stage_limit_minutes)>0&&now-since>Number(row.stage_limit_minutes)*60000;
}

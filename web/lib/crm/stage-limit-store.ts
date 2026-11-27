import 'server-only';
import {database} from '../db';
import {CrmError} from './model';
import {crmStageDefinitions,monitoredStage,type StageKind,type StageLimits} from './stage-limits';
export function validateStageLimits(raw:unknown):StageLimits {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new CrmError('Configuração de tempos inválida.');
 const result:StageLimits={};
 for(const [key,value] of Object.entries(raw)) {
  const [kind,stage]=key.split(':');
  if(key==='proposal:creating'||!Object.hasOwn(crmStageDefinitions,kind)||!monitoredStage(kind as StageKind,stage)||key!==kind+':'+stage)
   throw new CrmError('Etapa inválida para controle de tempo.');
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>5256000)
   throw new CrmError('Informe um limite entre 1 minuto e 3650 dias.');
  result[key]=value;
 }
 return result;
}
export async function stageLimitSettings() {
 const row=(await database().query('SELECT limits,version,updated_at FROM crm_stage_limit_settings WHERE id=1')).rows[0];
 if(!row)throw new CrmError('A configuração de tempos precisa ser inicializada.');
 return row as {limits:StageLimits;version:number;updated_at:string};
}
export async function saveStageLimits(raw:any,actor:string) {
 const limits=validateStageLimits(raw.limits);
 if(!Number.isSafeInteger(raw.version))throw new CrmError('Atualize a configuração antes de salvar.');
 const c=await database().connect();
 try {
 await c.query('BEGIN READ WRITE');
 const row=(await c.query('UPDATE crm_stage_limit_settings SET limits=$1::jsonb,version=version+1,updated_by=$2,updated_at=now() WHERE id=1 AND version=$3 RETURNING limits,version,updated_at',[JSON.stringify(limits),actor,raw.version])).rows[0];
 if(!row)throw new CrmError('Outra pessoa alterou os tempos. Recarregue antes de salvar.');
 await c.query('COMMIT');return row;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}

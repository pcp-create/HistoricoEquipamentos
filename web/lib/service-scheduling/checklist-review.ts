import {pendingTechnicianClosures} from './execution-locks';
import 'server-only';
import {operationMeterEquipment,unlinkedMeterMessage} from './meter-equipment';
import {isChecklistEquipmentLinked} from './checklist-equipment';
import {randomUUID} from 'node:crypto';
import {stagesOf} from './checklists';
import {emptyOperating,validDate,brazilToday,parsePlan} from '../equipment-management/planning';

/** Called inside the operation review transaction, after permissions and version checks. */
export async function reviewChecklist(c:any,operation:any,schedule:any,settings:any,email:string,confirmation?:any){
 if(pendingTechnicianClosures(operation.document).length)throw Error("Aguarde o encerramento da operação por todos os técnicos antes de revisar o relatório.");
 const run=operation.document.checklistRun;
 if(!run||run.reviewApplied)return operation.document;
 const stages=stagesOf(run.template);
 if(stages.some(s=>run.stages[s.id]?.status!=='submitted'))throw Error('Devolva todas as etapas antes de revisar o checklist.');
 const stage=stages.find(s=>s.fields.some(f=>f.type==='meter'));
 const field=stage?.fields.find(f=>f.type==='meter');
 const meter=field&&stage?run.stages[stage.id]?.answers?.[field.id]:null;
 const applied:any={at:new Date().toISOString(),by:email};
 if(meter!=null&&!operationMeterEquipment(operation.document)){
  if(typeof meter!=='number'||!Number.isFinite(meter)||meter<0||meter>100000000)throw Error('Horímetro inválido.');
  Object.assign(applied,{meter,meterUpdated:false,preventiveUpdated:false,reason:'operation_without_equipment',warning:unlinkedMeterMessage});
  return {...operation.document,checklistRun:{...run,reviewApplied:applied}};
 }
 if(meter!=null){
  if(typeof meter!=='number'||!Number.isFinite(meter)||meter<0||meter>100000000||!validDate(run.meterDate)||run.meterDate>brazilToday())throw Error('Horímetro ou data da leitura inválidos.');
  const equipment=operationMeterEquipment(operation.document);
  if(run.equipmentId!==equipment)throw Error('O equipamento vinculado à leitura difere da operação. Confirme o equipamento na revisão antes de concluir.');
   const linked=await isChecklistEquipmentLinked(c,equipment,schedule.company_id,schedule.order_id,operation.document.equipmentId);
  if(!linked)throw Error('O equipamento da leitura não está mais vinculado à OS.');
  const old=(await c.query('SELECT document FROM web_equipment_settings WHERE equipment_id=$1 FOR UPDATE',[equipment])).rows[0]?.document||emptyOperating;
  const plans=(await c.query('SELECT * FROM web_equipment_plans WHERE equipment_id=$1 AND NOT archived FOR UPDATE',[equipment])).rows;
  let confirmed=false;
  if(confirmation!=null){
   if(confirmation.equipmentId!==equipment||confirmation.meter!==meter||confirmation.meterDate!==run.meterDate||confirmation.previousMeter!==old.meter||confirmation.previousMeterDate!==old.meterDate)throw Error('A leitura ou o horímetro do equipamento mudou. Confira os valores e confirme novamente.');
   if(!validDate(old.meterDate)||run.meterDate<old.meterDate)throw Error('Uma coleta histórica não pode substituir o horímetro atual.');
   confirmed=true;
   applied.meterConfirmation={at:applied.at,by:email,equipmentId:equipment,before:{meter:old.meter,meterDate:old.meterDate},after:{meter,meterDate:run.meterDate}};
  }
  // An older report may be reviewed after a more recent reading. Never rewind the meter.
  if(!confirmed&&old.meterDate<=run.meterDate&&old.meter!=null&&meter<Number(old.meter))throw Error('A leitura não pode diminuir o horímetro do equipamento sem confirmar o valor real da máquina.');
  if(old.meterDate>run.meterDate&&old.meter!=null&&meter>Number(old.meter))throw Error('A leitura anterior é maior que o horímetro mais recente do equipamento.');
  // Historical reports are evidence of their collection date, not a new machine baseline.
  if(validDate(old.meterDate)&&old.meterDate>run.meterDate){
   Object.assign(applied,{equipmentId:equipment,meter,meterDate:run.meterDate,meterUpdated:false,preventiveUpdated:false,reason:'historical_reading',warning:'Coleta anterior à última leitura do equipamento. Mantida somente no relatório, sem atualizar o horímetro ou as preventivas.'});
   return {...operation.document,checklistRun:{...run,reviewApplied:applied}};
  }
  // An intervention contradicted by a later collected reading is not a valid
  // baseline for rejecting the next reading. Keep its original data for review.
  const superseded=(plan:any)=>validDate(old.meterDate)&&validDate(plan.lastDate)&&old.meterDate>=plan.lastDate&&old.meter!=null&&plan.lastMeter!=null&&Number(plan.lastMeter)>Number(old.meter);
  const inconsistent=plans.filter((p:any)=>superseded(p.document));
  if(inconsistent.length)applied.inconsistentInterventions=inconsistent.map((p:any)=>({id:p.id,name:p.document.name,meter:p.document.lastMeter,date:p.document.lastDate}));
  const conflict=plans.find((p:any)=>!superseded(p.document)&&p.document.lastDate<=run.meterDate&&p.document.lastMeter!=null&&Number(p.document.lastMeter)>meter);
  if(conflict&&!confirmed)throw Error(`Leitura menor que o horímetro da intervenção ${conflict.document.name}: ${conflict.document.lastMeter} h em ${conflict.document.lastDate}. Confira o histórico do equipamento.`);
  const orderNumber=(await c.query('SELECT numero_sequencia FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2',[schedule.company_id,schedule.order_id])).rows[0]?.numero_sequencia || schedule.order_id;
  async function audit(kind:string,before:any,after:any,planId:string|null=null){
   await c.query(`INSERT INTO web_equipment_events(equipment_id,plan_id,kind,document,created_by,display_name) VALUES($1,$2,$3,$4,$5,coalesce((SELECT display_name FROM web_user_access WHERE email=$5),$5))`,[equipment,planId,kind,JSON.stringify({before,after,source:'checklist_review',operationId:operation.id,operationPosition:operation.position,orderId:schedule.order_id,orderNumber,companyId:schedule.company_id,...(confirmed?{meterConfirmation:applied.meterConfirmation}:{})}),email]);
  }
  if(!old.meterDate||old.meterDate<=run.meterDate){
   const next={...emptyOperating,...old,meter,meterDate:run.meterDate};
   await c.query(`INSERT INTO web_equipment_settings(equipment_id,document,updated_by) VALUES($1,$2,$3) ON CONFLICT(equipment_id) DO UPDATE SET document=$2,updated_by=$3,updated_at=now(),version=web_equipment_settings.version+1`,[equipment,JSON.stringify(next),email]);
   await audit('settings',old,next);applied.meterUpdated=true;
  }else applied.meterUpdated=false;
  const identifier=run.template.m8Identifier?.trim();
  const matches=identifier?plans.filter((p:any)=>p.document.m8Identifier===identifier):[];
  if(matches.length>1)throw Error('Mais de uma preventiva está vinculada ao mesmo Identificador M8. Ajuste os planos do equipamento antes de revisar.');
  const existing=matches[0];
  const interval=settings.preventiveTypes?.find((p:any)=>p.m8Identifier===identifier);
  if(existing||interval){
   const before=existing?.document;
   if(before?.lastDate>run.meterDate){applied.preventiveUpdated=false;applied.planId=existing.id;}
   else{
    if(before?.lastMeter!=null&&Number(before.lastMeter)>meter&&!superseded(before)&&!confirmed)throw Error('A leitura não pode diminuir o horímetro da preventiva.');
    const after=existing?{...before,lastDate:run.meterDate,lastMeter:meter,lastOrder:String(schedule.order_id)}:parsePlan({name:identifier.slice(0,160),m8Identifier:identifier,hours:interval.hours,months:interval.months,lastDate:run.meterDate,lastMeter:meter,lastOrder:String(schedule.order_id),notes:'',items:[]});
    const planId=existing?.id||randomUUID();
    if(existing)await c.query('UPDATE web_equipment_plans SET document=$2,version=version+1,updated_at=now(),updated_by=$3 WHERE id=$1',[planId,JSON.stringify(after),email]);
    else await c.query('INSERT INTO web_equipment_plans(id,equipment_id,document,updated_by) VALUES($1,$2,$3,$4)',[planId,equipment,JSON.stringify(after),email]);
    await audit(existing?'maintenance':'plan',before||null,after,planId);
    applied.preventiveUpdated=true;applied.planId=planId;
   }
  }
  applied.equipmentId=equipment;applied.meter=meter;applied.meterDate=run.meterDate;applied.m8Identifier=identifier||'';
 }
 return {...operation.document,checklistRun:{...run,reviewApplied:applied}};
}

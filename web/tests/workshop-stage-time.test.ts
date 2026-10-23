import {test} from 'node:test';import assert from 'node:assert/strict';
import {workshopStageTime} from '../lib/workshop/stage-time';
const day=86400000,start=Date.parse('2026-10-01T12:00:00Z');
const e=(d:number,stage:string,id=d)=>({id,created_at:new Date(start+d*day).toISOString(),action:'Etapa: teste',document:{nextStage:stage}});
test('repeated stages accumulate all periods without resetting entry time or same-stage start',()=>{
 const v={entered_at:new Date(start).toISOString(),stage:'repair',events:[{id:0,created_at:new Date(start).toISOString(),action:'Entrada registrada'},e(1,'repair'),e(3,'parts'),e(6,'repair'),e(7,'repair')]};
 const t=workshopStageTime(v,start+8*day);assert.equal(t.totals.received,day);assert.equal(t.totals.repair,4*day);assert.equal(t.totals.parts,3*day);assert.equal(t.currentSince,start+6*day);assert.equal(t.unknownMs,0);
 assert.equal(workshopStageTime({...v,exited_at:new Date(start+7*day).toISOString()},start+9*day).currentMs,3*day);
});
test('imported ages are not guessed and older observed stages and rental approval are retained',()=>{
 const v={entered_at:new Date(start).toISOString(),stage:'approval',source:{sheet:'Equipamentos Locação em revisão'},events:[{id:1,action:'Importado da planilha',created_at:new Date(start+4*day).toISOString(),document:{notes:'3 - AGUARD. APROVAÇÃO'}},{id:2,action:'Etapa: Em reparo',created_at:new Date(start+5*day).toISOString()},e(7,'approval')]};
 const t=workshopStageTime(v,start+9*day);assert.equal(t.unknownMs,4*day);assert.equal(t.currentMs,3*day);assert.equal(t.totals.repair,2*day);
});

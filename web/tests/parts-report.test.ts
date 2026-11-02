import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeParts,type PartsReportRow} from '../lib/service-scheduling/parts-report-model';
const row=(patch:Partial<PartsReportRow>={}):PartsReportRow=>({scheduleId:'1',key:'1',company:1,order:'100',customer:'Cliente',equipment:'Máquina',orderStatus:'Pendente',programmingStatus:'Pendente',sourceOrder:'100',product:'10',name:'Filtro',unit:'UN',quantity:5,withdrawn:0,used:0,needed:5,eligible:true,exclusion:'',collectedAt:'2026-11-02',stock:6,available:6,stockAt:'2026-11-02',purchases:[],purchasesComplete:true,purchasesAt:'2026-11-02',inconsistent:false,...patch});
test('consolidation shares stock and purchase balances instead of counting per OS',()=>{
 const purchase={id:'55',number:'55',supplier:'Fornecedor',unit:'UN',quantity:3,date:'2026-11-05',status:'Aprovado'};
 const rows=[row({purchases:[purchase]}),row({order:'101',purchases:[purchase]})];
 const [g]=summarizeParts(rows,'2026-11-02');
 assert.equal(g.needed,10);assert.equal(g.available,6);assert.equal(g.purchaseQuantity,3);assert.equal(g.toBuy,1);assert.equal(g.state,'Complementar compra');
 assert.equal(rows[0].action,rows[1].action);
});
test('companies and units stay separate and excluded records create no purchase demand',()=>{
 const rows=[row(),row({company:2}),row({unit:'L'}),row({eligible:false,exclusion:'OS encerrada/cancelada'})];
 assert.equal(summarizeParts(rows,'2026-11-02').length,3);
 assert.equal(rows[3].state,'OS encerrada/cancelada');
});
test('missing information never creates confident purchasing quantities',()=>{
 for(const patch of [{available:null},{collectedAt:null},{inconsistent:true},{quantity:null}]){
  const [g]=summarizeParts([row(patch)],'2026-11-02');assert.equal(g.state,'Conferir dados');assert.equal(g.toBuy,null);
 }
 const [g]=summarizeParts([row({available:0,purchasesComplete:false})],'2026-11-02');assert.equal(g.state,'Compras não confirmadas');assert.equal(g.toBuy,null);
});
test('purchase deadlines differentiate missing dates, overdue and expected arrivals',()=>{
 for(const [date,state] of [[null,'Compra sem prazo'],['2026-10-30','Compra atrasada'],['2026-11-06','Aguardando compra']] as const){
  const [g]=summarizeParts([row({available:0,purchases:[{id:'1',number:'1',supplier:'F',unit:'UN',quantity:5,date,status:'Aprovado'}]})],'2026-11-02');assert.equal(g.state,state);
 }
});
test('multiple delivery dates on same purchase retain quantities and withdrawals do not demand new stock',()=>{
 const p={id:'1',number:'1',supplier:'F',unit:'UN',quantity:2,status:'Aprovado'};
 const [g]=summarizeParts([row({available:0,purchases:[{...p,date:'2026-11-03'},{...p,date:'2026-11-04'}]})],'2026-11-02');assert.equal(g.purchaseQuantity,4);
 const r=row({withdrawn:5,needed:0});assert.equal(summarizeParts([r],'2026-11-02').length,0);assert.equal(r.state,'Retirada atendida');
});
test('different purchase units require review before purchasing more',()=>{
 const [g]=summarizeParts([row({available:0,purchases:[{id:'2',number:'2',supplier:'F',unit:'CX',quantity:1,date:'2026-11-04',status:'Aprovado'}]})],'2026-11-02');
 assert.equal(g.toBuy,null);assert.equal(g.state,'Conferir unidade da compra');
});

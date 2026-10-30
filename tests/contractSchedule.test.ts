import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contractSchedule} from '../src/sync/contractSchedule.js';
const fixed=(id:number,start:string,end:string,total:number,frequency:unknown='Mensal')=>({id,inicioFaturamento:start,finalFaturamento:end,total,periodicidadeFaturamento:frequency});
test('contract charges combine fixed lines and one-time variable charges, not header totals',()=>{
 const result=contractSchedule({valor:237000,pessoaId:7,final:'2029-09-01'},[
  fixed(1,'2026-10-01','2029-09-01',6500),
  fixed(2,'2026-10-01','2026-12-01',1500,0),
 ],[{id:3,inicioFaturamento:'2026-11-20',total:250}]);
 assert.equal(result.installments.length,36);
 assert.deepEqual(result.installments.slice(0,3).map(r=>[r.period,r.amount,r.number,r.total]),[['2026-10',8000,1,36],['2026-11',8250,2,36],['2026-12',6500,3,36]]);
 assert.equal(result.installments.at(-1)!.amount,6500);
 assert.equal(result.installments[0]!.charges[0]!.customer,'7');
});
test('annual fixed charges recur only in the billing month; total takes precedence over unit price',()=>{
 const result=contractSchedule({pessoaId:1},[{...fixed(1,'2026-04-01','2028-04-01',1200,'Anual'),valor:100,quantidade:12,clienteId:2}],[]);
 assert.deepEqual(result.installments.map(r=>[r.period,r.amount,r.total]),[['2026-04',1200,3],['2027-04',1200,3],['2028-04',1200,3]]);
 assert.equal(result.installments[0]!.charges[0]!.customer,'2');
 assert.deepEqual(contractSchedule({valor:1200},[],[]).installments,[]);
});
test('invalid child data never becomes a silent zero forecast',()=>{
 for(const row of [fixed(1,'invalid','2026-12-01',10),fixed(1,'2026-12-01','2026-10-01',10),fixed(1,'2026-01-01','2026-12-01',NaN),fixed(1,'2026-01-01','2026-12-01',10,'Unknown')])assert.throws(()=>contractSchedule({},[row],[]));
 assert.throws(()=>contractSchedule({},[],[{id:1,inicioFaturamento:'2026-02-30',total:10}]));
});

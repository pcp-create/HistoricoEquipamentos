import {test} from 'node:test';import assert from 'node:assert/strict';
import {projection,type SourceRow} from '../lib/sales-projection/model';
import {contractSchedule} from '../../src/sync/contractSchedule';
const contract:SourceRow={company_id:1,kind:'fContratos',id:'81',payload:{pessoaId:7,pessoaNome:'Cliente',estabelecimentoId:1,inicio:'2026-10-01',final:'2029-09-01',valor:237000,
 _billingSchedule:contractSchedule({pessoaId:7,final:"2029-09-01"},[{id:80,inicioFaturamento:'2026-10-01',finalFaturamento:'2029-09-01',total:6500,periodicidadeFaturamento:'Mensal'},{id:81,inicioFaturamento:'2026-10-01',finalFaturamento:'2026-12-01',total:1500,periodicidadeFaturamento:0}],[])} };
const invoice=(id:string,value:number,extra:Record<string,unknown>={}):SourceRow=>({company_id:1,kind:'fFaturamento',id,payload:{empresaId:1,pessoaId:7,emissao:'2026-10-30',status:'Processado',totalGeral:value,...extra}});
test('contract 81 groups two charges into 1/36, including both already billed invoices without doubling projection',()=>{
 const result=projection([contract,invoice('10',6500),invoice('11',1500)],[],'2026-10','2026-10-30');
 const row=result.details.find(d=>d.kind==='contracts')!;
 assert.equal(row.amount,8000);assert.equal(row.fields!.installment,'1/36');assert.equal(row.fields!.billed,8000);assert.equal(row.fields!.pending,0);
 assert.equal(result.rows[0].contracts,8000);assert.equal(result.rows[0].contractBilled,8000);assert.equal(result.rows[0].contractPending,0);assert.equal(result.rows[0].projection,8000);
});
test('partial, combined, cancelled and excluded invoicing and stopped short-term lines',()=>{
 const partial=projection([contract,invoice('10',6500),invoice('11',1500,{status:'Cancelado'}),invoice('12',1500,{estaExcluido:true})],[],'2026-10','2026-10-30');
 assert.equal(partial.rows[0].contractBilled,6500);assert.equal(partial.rows[0].contractPending,1500);assert.equal(partial.rows[0].projection,8000);
 assert.equal(projection([contract,invoice('10',8000)],[],'2026-10','2026-10-30').rows[0].contractPending,0);
 assert.equal(projection([contract],[],'2026-12','2026-10-30').rows[0].contracts,6500);
});
test('legacy snapshots are flagged instead of using the header; ambiguous invoices stay unallocated and contexts deduplicate',()=>{
 const legacy={...contract,payload:{...contract.payload,_billingSchedule:undefined}};
 const result=projection([legacy],[],'2026-10','2026-10-30');assert.equal(result.rows[0].contracts,0);assert.equal(result.contractsWithoutSchedule,1);
 const duplicates=projection([contract,{...contract,company_id:2},invoice('10',8000)],[],'2026-10','2026-10-30');assert.equal(duplicates.rows[0].contracts,8000);assert.equal(duplicates.rows[0].contractBilled,8000);
 const ambiguous=projection([contract,{...contract,id:'82'},invoice('10',8000)],[],'2026-10','2026-10-30');assert.equal(ambiguous.rows[0].contractBilled,0);assert.equal(ambiguous.ambiguousContractInvoices,1);
});

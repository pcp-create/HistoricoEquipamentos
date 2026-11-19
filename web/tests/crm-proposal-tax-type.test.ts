import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {applyProposalTaxType} from '../lib/crm/proposal-tax-type';
import {emptyDraft} from '../lib/crm/model';
import {hydratePdfProductTaxes} from '../lib/crm/product-taxes';
test('proposal catalog controls fiscal type, including old drafts and changed mappings',async()=>{
 const db=new PGlite();
 try{
 await db.exec(readFileSync(new URL('../sql/108_crm.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../sql/120_crm_proposal_tax_type.sql',import.meta.url),'utf8'));
 const {rows}=await db.query<{id:number}>('SELECT id FROM crm_proposal_types LIMIT 1');const id=rows[0].id;
 const draft={...emptyDraft(),commercial:{taxBudgetType:'999',deliveryDays:'15'},items:[{kind:'material' as const,code:'50',name:'Filtro',quantity:'1',price:'10'}]};
 const missing=await applyProposalTaxType(draft,id,db as any);
 assert.equal(missing.commercial?.taxBudgetType,'');
 await assert.rejects(()=>hydratePdfProductTaxes(missing),/cadastro do tipo de proposta/);
 await db.query('UPDATE crm_proposal_types SET tax_budget_type=7 WHERE id=$1',[id]);
 const mapped=await applyProposalTaxType(draft,id,db as any);
 assert.equal(mapped.commercial?.taxBudgetType,'7');assert.equal(mapped.commercial?.deliveryDays,'15');
 let sent:any;
 await hydratePdfProductTaxes({...mapped,company:'1',customer:'10'},async()=>async(_url:string,payload:any)=>{sent=payload;return [{produtoId:50,impostos:{valorIcms:0,valorIcmsSt:0,valorPis:0,valorCofins:0,valorIpi:0}}];});
 assert.equal(sent.tipoOrcamentoId,7);
 await db.query('UPDATE crm_proposal_types SET tax_budget_type=8 WHERE id=$1',[id]);
 assert.equal((await applyProposalTaxType(mapped,id,db as any)).commercial?.taxBudgetType,'8');
 }finally{await db.close();}
});

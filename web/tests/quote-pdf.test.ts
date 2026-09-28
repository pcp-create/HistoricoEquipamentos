import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {quotePdf,proposalNumber} from '../lib/quotes/pdf';
import {blankQuote,QuoteValidation} from '../lib/quotes/types';
import {writeFile} from 'node:fs/promises';
const item=(kind:'material'|'service',name:string,price='100.00')=>({key:name,kind,name,code:'19420',unit:'UN',quantity:'2',price,selected:true,source:'',referencePrice:'',minimumPrice:'',lastPrice:'',referenceAt:''});
test('proposal PDF generates separate materials/services and paginates long descriptions',async()=>{
 const q={...blankQuote(),number:'PAPP105900',created_at:'2026-09-26T07:02:00Z',client:'OBRA KOLPING ESTADUAL DE SANTA CATARINA',equipment:'COMPRESSOR DE PARAFUSO',serial:'38077',responsible:'Responsável',items:[item('material','ELEMENTO FILTRO DE AR'),item('service','SERVIÇO DE MANUTENÇÃO')]};
 const bytes=await quotePdf(q);await writeFile('/tmp/proposta-exemplo.pdf',bytes);
 const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),1);
 const compact=await quotePdf({...q,notes:'Orçamento para manutenção preventiva de 2.000 horas.\n\nPrazo de entrega após aprovação formal.',equipment:'COMPRESSOR DE PARAFUSO - ROTOR 06 - SÉRIE 38077',items:Array.from({length:8},(_,i)=>item(i===7?'service':'material','Item da proposta '+i))},{document:'12.345.678/0001-90',city:'RIO DO SUL',state:'SC',address:'RUA ADOLFO KOLPING - CANTA GALO'});
 assert.equal((await PDFDocument.load(compact)).getPageCount(),1);
 await writeFile('/tmp/proposta-compacta.pdf',compact);
 const many=await quotePdf({...q,items:Array.from({length:100},(_,i)=>item(i%2?'service':'material','Item '+i+' descrição longa '.repeat(20)))});
 assert.ok((await PDFDocument.load(many)).getPageCount()>2);
 await assert.rejects(()=>quotePdf({...q,items:[item('material','Sem preço','')]}),QuoteValidation);
 assert.equal(proposalNumber('PAPP105900'),'PAPP105900');assert.equal(proposalNumber('12'),'ORÇ-00012');
});

test('delivery depends on sufficient available stock in the proposal company and unit',async()=>{
 const {deliveryDeadline}=await import('../lib/quotes/delivery');
 const i={...item('material','Óleo'),products:[{company_id:1,product_id:'19420',unit:'UN',current:{available:'2'}}]} as any;
 assert.equal(deliveryDeadline(i,'1'),'Imediato');
 assert.equal(deliveryDeadline(i,'2'),'À consultar');
 for(const available of ['1','0','-3',null,'']){i.products[0].current.available=available;assert.equal(deliveryDeadline(i,'1'),'À consultar');}
 i.products[0].current.available='10';i.unit='L';assert.equal(deliveryDeadline(i,'1'),'À consultar');
 assert.equal(deliveryDeadline(item('service','Serviço'),'1'),'');
});

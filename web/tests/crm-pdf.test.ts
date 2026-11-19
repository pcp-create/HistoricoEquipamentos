import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {PDFDocument,PDFRawStream,decodePDFRawStream} from 'pdf-lib';
import {proposalPdf} from '../lib/crm/pdf';
import {emptyDraft} from '../lib/crm/model';
const item:any={kind:'material',code:'19420',name:'ELEMENTO FILTRO DE AR',quantity:'2',price:'150.00',unitCost:'71.23',internalNotes:'CONTEUDO INTERNO CONFIDENCIAL'};
const proposal={number:17,created_at:'2026-11-13T12:00:00Z',customer_name:'Cliente de teste LTDA',names:{equipment:'COMPRESSOR DE PARAFUSO'},document:{...emptyDraft(),company:'1',items:[item,{...item,kind:'service',code:'30',name:'MANUTENÇÃO PREVENTIVA',quantity:'1',price:'250.00'}],notes:'Inspeção e manutenção preventiva do equipamento.',internalNotes:'NAO PUBLICAR',commercial:{contact:'João',phone:'49999999999',sellerName:'Vendedor de teste',paymentName:'30 dias',validity:'15 dias úteis'}}};
test('CRM produces the landscape proposal model and paginates item descriptions',async()=>{
 const bytes=await proposalPdf(proposal,{document:'12345678000100',payload:{razaoSocial:'Cliente de teste LTDA',nomeFantasia:'Nome comercial de teste',municipioNome:'Rio do Sul',ufSigla:'SC',logradouro:'Rua de teste',numero:'100'}},{model:'GA22',serial:'ABC123'});
 await writeFile('/tmp/crm-proposta.pdf',bytes);const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),1);assert.ok(pdf.getPage(0).getWidth()>pdf.getPage(0).getHeight());
 const many=await proposalPdf({...proposal,document:{...proposal.document,items:Array.from({length:100},(_,i)=>({...item,code:String(i+1),name:'Peça '+i+' descrição técnica '.repeat(15)}))}});
 assert.ok((await PDFDocument.load(many)).getPageCount()>2);
 await assert.rejects(()=>proposalPdf({...proposal,document:{...proposal.document,items:[]}}),/Inclua/);
});

test('proposal PDF receives trusted stock, seller delivery and simulated tax amounts',async()=>{
 const {taxKey}=await import('../lib/crm/product-terms');
 const document={...proposal.document,commercial:{...proposal.document.commercial,deliveryDays:'15',taxBudgetType:'1'},items:[{...item,availableStock:2},{...item,code:'20120',availableStock:0},{...item,code:'13927',availableStock:10,deliveryLeadTime:'7 dias úteis'}]};
 document.items=document.items.map(i=>({...i,taxes:{key:taxKey(document,i),at:'2026-11-18T12:00:00Z',icms:5400,icmsSt:0,ipi:1500,pis:495,cofins:2280}}));
 const bytes=await proposalPdf({...proposal,document},{},{},{19420:"84219910",20120:"84219910",13927:"84149039"});
 await writeFile('/tmp/crm-proposta-impostos.pdf',bytes);
 assert.equal((await PDFDocument.load(bytes)).getPageCount(),1);
});

test('proposal without taxes renders without fiscal setup',async()=>{
 const bytes=await proposalPdf(proposal,{},{},{19420:'84219910'},{includeTaxes:false});
 await writeFile('/tmp/crm-proposta-sem-impostos.pdf',bytes);
 assert.equal((await PDFDocument.load(bytes)).getPageCount(),1);
});

test('public item notes appear in both PDF modes while internal notes remain private',async()=>{
 for(const includeTaxes of [true,false]){
 const bytes=await proposalPdf({...proposal,document:{...proposal.document,items:[{...item,notes:'PUBLIC PRODUCT NOTE',internalNotes:'PRIVATE ITEM NOTE'}]}},{},{},{},{includeTaxes});
 const pdf=await PDFDocument.load(bytes);
 const content=pdf.context.enumerateIndirectObjects().filter(([,object])=>object instanceof PDFRawStream).map(([,object])=>Buffer.from(decodePDFRawStream(object as PDFRawStream).decode()).toString('latin1')).join('');
 assert.ok(content.includes(Buffer.from('PUBLIC PRODUCT NOTE').toString('hex').toUpperCase()));
 assert.ok(!content.includes(Buffer.from('PRIVATE ITEM NOTE').toString('hex').toUpperCase()));
 }
});

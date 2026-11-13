import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {proposalPdf} from '../lib/crm/pdf';
import {emptyDraft} from '../lib/crm/model';
const item:any={kind:'material',code:'19420',name:'ELEMENTO FILTRO DE AR',quantity:'2',price:'150.00',unitCost:'71.23',internalNotes:'CONTEUDO INTERNO CONFIDENCIAL'};
const proposal={number:17,created_at:'2026-11-13T12:00:00Z',customer_name:'Cliente de teste LTDA',names:{equipment:'COMPRESSOR DE PARAFUSO'},document:{...emptyDraft(),company:'1',items:[item,{...item,kind:'service',code:'30',name:'MANUTENÇÃO PREVENTIVA',quantity:'1',price:'250.00'}],notes:'Inspeção e manutenção preventiva do equipamento.',internalNotes:'NAO PUBLICAR',commercial:{contact:'João',phone:'49999999999',sellerName:'Vendedor de teste',paymentName:'30 dias',validity:'15 dias úteis'}}};
test('CRM produces the landscape proposal model and paginates item descriptions',async()=>{
 const bytes=await proposalPdf(proposal,{document:'12345678000100',payload:{municipioNome:'Rio do Sul',ufSigla:'SC',logradouro:'Rua de teste',numero:'100'}},{model:'GA22',serial:'ABC123'});
 await writeFile('/tmp/crm-proposta.pdf',bytes);const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),1);assert.ok(pdf.getPage(0).getWidth()>pdf.getPage(0).getHeight());
 const many=await proposalPdf({...proposal,document:{...proposal.document,items:Array.from({length:100},(_,i)=>({...item,code:String(i+1),name:'Peça '+i+' descrição técnica '.repeat(15)}))}});
 assert.ok((await PDFDocument.load(many)).getPageCount()>2);
 await assert.rejects(()=>proposalPdf({...proposal,document:{...proposal.document,items:[]}}),/Inclua/);
});

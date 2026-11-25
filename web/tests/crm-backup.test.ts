import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,PDFRawStream,decodePDFRawStream} from 'pdf-lib';
import {emptyDraft,proposalDraft} from '../lib/crm/model';
import {proposalPdf} from '../lib/crm/pdf';
import {DEFAULT_BACKUP_TERMS} from '../lib/crm/backup';

const commercial={backupEnabled:'yes',backupDays:'14',backupRentalIncluded:'yes',backupRentalValue:'98765.43',backupTerms:DEFAULT_BACKUP_TERMS};
const draft={...emptyDraft(),company:'1',commercial,items:[{kind:'service' as const,code:'30',name:'MANUTENÇÃO',quantity:'1',price:'100.00'}]};
test('backup proposal data survives parsing and validates values',()=>{
 assert.deepEqual(proposalDraft(draft).commercial,commercial);
 assert.throws(()=>proposalDraft({...draft,commercial:{...commercial,backupDays:'-1'}}),/prazo de utilização/);
 assert.throws(()=>proposalDraft({...draft,commercial:{...commercial,backupRentalValue:'-1'}}),/locação embutida/);
 assert.throws(()=>proposalDraft({...draft,commercial:{...commercial,backupEnabled:'talvez'}}),/backup/);
 assert.throws(()=>proposalDraft({...draft,commercial:{...commercial,backupRentalValue:''}}),/Informe o valor da locação embutida/);
 assert.doesNotThrow(()=>proposalDraft({...draft,commercial:{...commercial,backupRentalIncluded:'no',backupRentalValue:''}}));
 assert.doesNotThrow(()=>proposalDraft({...draft,commercial:{...commercial,backupEnabled:'no',backupRentalValue:''}}));
 assert.doesNotThrow(()=>proposalDraft({...draft,commercial:{...commercial,backupRentalValue:'0'}}));
});
test('PDF shows backup conditions without disclosing internal rental value',async()=>{
 for(const includeTaxes of [true,false]){
  for(const enabled of ['yes','no']){
   const pdf=await PDFDocument.load(await proposalPdf({number:1,document:{...draft,commercial:{...commercial,backupEnabled:enabled}}},{},{},{},{includeTaxes}));
   const content=pdf.context.enumerateIndirectObjects().filter(([,o])=>o instanceof PDFRawStream).map(([,o])=>Buffer.from(decodePDFRawStream(o as PDFRawStream).decode()).toString('latin1')).join('');
   const contains=(s:string)=>content.includes(Buffer.from(s,'latin1').toString('hex').toUpperCase());
   assert.equal(contains('CONDIÇÕES DO EQUIPAMENTO BACKUP'),enabled==='yes');
   assert.equal(contains('Prazo previsto de utilização: 14 dias.'),enabled==='yes');
   assert.equal(contains('98.765,43'),false);
  }
 }
});
test('scope and backup conditions appear side by side and long text continues on later pages',async()=>{
 const document={...draft,notes:'ESCOPO DE TESTE',commercial:{...commercial,backupTerms:('Condição de empréstimo. '.repeat(140)+'FIM DAS CONDIÇÕES')}};
 const pdf=await PDFDocument.load(await proposalPdf({number:1,document},{},{},{},{includeTaxes:false}));
 const content=pdf.context.enumerateIndirectObjects().filter(([,o])=>o instanceof PDFRawStream).map(([,o])=>Buffer.from(decodePDFRawStream(o as PDFRawStream).decode()).toString('latin1')).join('');
 const position=(label:string)=>{
  const hex=Buffer.from(label,'latin1').toString('hex').toUpperCase();
  const match=content.match(new RegExp(`1 0 0 1 ([\\d.]+) ([\\d.]+) Tm\\s*<${hex}> Tj`));
  assert.ok(match, label); return [Number(match[1]),Number(match[2])];
 };
 const scope=position('ESCOPO / OBSERVAÇÕES'),backup=position('CONDIÇÕES DO EQUIPAMENTO BACKUP');
 assert.equal(scope[1],backup[1]); assert.ok(backup[0]>scope[0]);
 assert.ok(pdf.getPageCount()>1);
 assert.ok(content.includes(Buffer.from('FIM DAS CONDIÇÕES','latin1').toString('hex').toUpperCase()));
});

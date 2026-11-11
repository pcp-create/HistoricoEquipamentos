import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,PDFName,PDFString} from 'pdf-lib';
import {addReportFooter} from '../lib/reports/pdf-footer';
import {reportFooterHtml} from '../lib/reports/html-footer';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('brand links work on every PDF page without replacing existing document links',async()=>{
 const pdf=await PDFDocument.create();
 const portrait=pdf.addPage([595.28,841.89]);pdf.addPage([841.89,595.28]);
 portrait.node.addAnnot(pdf.context.register(pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[10,100,100,120],A:{S:'URI',URI:PDFString.of('https://example.com/equipamento')}})));
 await addReportFooter(pdf,'Relatório técnico · Gestão Integrada');
 const saved=await PDFDocument.load(await pdf.save());
 for(const page of saved.getPages()){
  const annotations=page.node.Annots()!;
  const links=Array.from({length:annotations.size()},(_,i)=>{
   const annotation:any=saved.context.lookup(annotations.get(i));
   const action:any=saved.context.lookup(annotation.get(PDFName.of('A')));
   return action.get(PDFName.of('URI')).decodeText();
  });
  assert.ok(links.includes('https://wa.me/5549999070882'));
  if(page===saved.getPages()[0])assert.ok(links.includes('https://example.com/equipamento'));
 }
});
test('standalone and integrated report footers stay identical and escape titles',()=>{
 const sandbox:any={window:{}};
 runInNewContext(readFileSync('public/tools/report-footer.js','utf8'),sandbox);
 const title='<Relatório & teste>',page='Página 1 de 2';
 assert.equal(sandbox.window.gwReportFooter(title,page),reportFooterHtml(title,page));
 assert.ok(reportFooterHtml(title).includes('&lt;Relatório &amp; teste&gt;'));
});

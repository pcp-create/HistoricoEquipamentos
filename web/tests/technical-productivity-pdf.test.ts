import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,PDFRawStream,decodePDFRawStream} from 'pdf-lib';
import {productivityPdf} from '../lib/technical-productivity/pdf';

test('PDF groups technicians and includes daily times, orders and monthly productivity',async()=>{
 const detail={kind:'logged',type:'work',hours:4,order:'123',operation:1,customer:'Cliente Teste',equipment:'Compressor GA22',start:'2026-11-02T11:00:00Z',end:'2026-11-02T15:00:00Z'};
 const data={month:'2026-11',users:[{name:'Ana Silva',days:{'2026-11-02':{logged:4,planned:8,details:[detail]}}},{name:'Bruno Silva',days:{'2026-11-03':{logged:0,planned:2,details:[]}}}]};
 const pdf=await PDFDocument.load(await productivityPdf(data));const content=pdf.context.enumerateIndirectObjects().filter(([,o])=>o instanceof PDFRawStream).map(([,o])=>Buffer.from(decodePDFRawStream(o as PDFRawStream).decode()).toString('latin1')).join('');
 for(const value of ['Ana Silva','Bruno Silva','200%','02/11/2026 · seg','03/11/2026 · ter','OS-123 / Operação 01','Cliente Teste','Compressor GA22'])assert.ok(content.includes(Buffer.from(value,'latin1').toString('hex').toUpperCase()),value);
 const many={month:'2026-11',users:[{name:'Ana Silva',days:Object.fromEntries(Array.from({length:30},(_,i)=>['2026-11-'+String(i+1).padStart(2,'0'),{logged:4,planned:8,details:[detail,detail]}]))}]};
 assert.ok((await PDFDocument.load(await productivityPdf(many))).getPageCount()>1);
});

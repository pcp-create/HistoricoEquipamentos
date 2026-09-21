import {test} from 'node:test';import assert from 'node:assert/strict';
import {buildRentalReport,rentalMessage,type RentalSource} from '../lib/rental-reports/report';
import {rentalPdf} from '../lib/rental-reports/pdf';import {PDFDocument} from 'pdf-lib';
const source=(days:number|null,key='rented'):RentalSource=>({id:String(days),name:'Máquina <teste>',serial:'SERIE',internal_code:'LOC1',rentalStatus:{key,label:key==='loaned'?'Emprestado':'Locado',customer:'Cliente & Cia',company:1,order:'42',contract:{start:'2026-01-01',end:days==null?null:new Date(Date.UTC(2026,8,21+days)).toISOString().slice(0,10)}}});
test('rental report boundaries, loan inclusion and missing dates',()=>{
 const rows=[-1,0,4,5,29,30,null].map(n=>source(n));rows.push(source(2,'loaned'),source(1,'reserved'));
 const daily=buildRentalReport(rows,'overdue','2026-09-21'),weekly=buildRentalReport(rows,'weekly','2026-09-21'),monthly=buildRentalReport(rows,'monthly','2026-09-21');
 assert.deepEqual(daily.rows.map(r=>r.contract.remaining),[-1,0,2,4]);
 assert.deepEqual(weekly.rows.map(r=>r.contract.remaining),[0,2,4,5,29]);
 assert.equal(monthly.equipmentCount,8);assert.equal(monthly.coverage.incomplete,1);
 assert.ok(!rentalMessage(monthly).html.includes('<teste>'));assert.ok(rentalMessage(monthly).html.includes('&lt;teste&gt;'));
});
test('rental PDF supports pagination and WhatsApp limits ten items',async()=>{
 const r=buildRentalReport(Array.from({length:15},(_,i)=>source(i)),'monthly','2026-09-21');
 const msg=rentalMessage(r).whatsapp;assert.ok(msg.includes('*10.'));assert.ok(!msg.includes('*11.'));assert.ok(msg.includes('Mais 5 itens'));
 assert.ok((await PDFDocument.load(await rentalPdf(r))).getPageCount()>1);
});

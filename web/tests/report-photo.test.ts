import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {randomBytes} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {renderTaskChecklistPdf} from '../lib/service-scheduling/checklist-pdf';
import {reportPhoto} from '../lib/service-scheduling/report-photo';
test('PDF reuses repeated photos without repeating their binary content',async()=>{
 const photo=await sharp(randomBytes(1200*1000*3),{raw:{width:1200,height:1000,channels:3}}).png().toBuffer();
 const base={title:'Inspeção',order:'15253',client:'Cliente',equipment:'Secador',photos:[{id:'1',content:photo}]};
 const report=(count:number)=>[{id:'s',name:'Inspeção',number:'01',status:'submitted',groups:[{name:'',fields:Array.from({length:count},(_,i)=>({id:String(i),label:'Foto '+i,value:'NOK',type:'photo',photos:['1'],comment:''}))}]}];
 const single=await renderTaskChecklistPdf({...base,report:report(1)}),repeated=await renderTaskChecklistPdf({...base,report:report(6)});
 assert.ok(repeated.length<3_000_000);
 assert.ok(repeated.length-single.length<30_000,'repeated references embed the photo only once');
 assert.ok((await PDFDocument.load(repeated)).getPageCount()>0);
});
test('PDF signature stays PNG with transparency while photos are resized JPEG copies',async()=>{
 const original=await sharp({create:{width:1600,height:300,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
 const signature=await reportPhoto(original,true,100_000),photo=await reportPhoto(original,false,100_000);
 const signatureMeta=await sharp(signature).metadata(),photoMeta=await sharp(photo).metadata();
 assert.equal(signatureMeta.format,'png');assert.equal(signatureMeta.hasAlpha,true);
 assert.equal(photoMeta.format,'jpeg');assert.ok(signatureMeta.width!<=1200);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {uploadReportPhoto} from '../lib/upload-report-photo';
test('lost photo response retries with the same receipt; rejected field does not retry',async()=>{
 const ids:string[]=[];const form=new FormData();form.set('file',new Blob(['photo']),'photo.jpg');
 const id=await uploadReportPhoto(form,async(_input,init)=>{ids.push(String((init!.body as FormData).get('requestId')));if(ids.length===1)throw Error('response lost');return Response.json({id:'42'});});
 assert.equal(id,'42');assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);assert.match(ids[0],/^[0-9a-f-]{36}$/);
 let calls=0;await assert.rejects(uploadReportPhoto(new FormData(),async()=>{calls++;return Response.json({error:'Etapa fechada'},{status:400});}),/Etapa fechada/);assert.equal(calls,1);
});

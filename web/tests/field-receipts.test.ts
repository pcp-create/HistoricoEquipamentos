import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {fieldReceipts} from '../lib/service-scheduling/field-receipts';
test('receipts are scoped to the authenticated actor and identify photo mappings',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 try{await db.exec(`CREATE TABLE web_field_events(request_id uuid,operation_id uuid,actor text);CREATE TABLE web_service_checklist_photos(id bigint,client_request_id uuid,operation_id uuid,created_by text);
 INSERT INTO web_field_events VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','tech'),('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010','other');
 INSERT INTO web_service_checklist_photos VALUES(123,'00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000010','tech');`);
 g.historyPool=db;
 const result=await fieldReceipts('tech',['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003']);
 assert.equal(result.receipts.length,2);assert.equal(result.receipts.find(r=>r.type==='photo')?.photoId,'123');
 await assert.rejects(fieldReceipts('tech',['invalid']),/inválida/);
 }finally{g.historyPool=old;await db.close();}
});

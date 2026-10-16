import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {requireReportActivity} from '../lib/service-scheduling/report-activity';
test('report editing requires this technician running work on this operation',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE web_field_sessions(id int,operation_id text,actor text,kind text,state text);`);
 const check=()=>requireReportActivity(db,'op1','tech');
 await assert.rejects(check,/Inicie ou retome/);
 for(const [operation,actor,kind,state] of [['op2','tech','work','running'],['op1','other','work','running'],['op1','tech','travel','running'],['op1','tech','work','paused'],['op1','tech','work','finished']]){
 await db.query('INSERT INTO web_field_sessions VALUES(1,$1,$2,$3,$4)',[operation,actor,kind,state]);
 await assert.rejects(check,/Inicie ou retome/);await db.exec('DELETE FROM web_field_sessions');
 }
 await db.exec("INSERT INTO web_field_sessions VALUES(1,'op1','tech','work','running')");
 await check();
 }finally{await db.close()}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('attachment migration permits up to 5 MB, preserves rows and remains repeatable',async()=>{
 const db=new PGlite();
 try{
 await db.exec('CREATE TABLE web_task_attachments(content bytea NOT NULL CHECK(octet_length(content)<=3000000)); INSERT INTO web_task_attachments VALUES(decode(\'01\',\'hex\'));');
 const sql=readFileSync('sql/100_task_attachment_limit.sql','utf8');await db.exec(sql);await db.exec(sql);
 await db.query('INSERT INTO web_task_attachments VALUES($1)',[Buffer.alloc(5_000_000)]);
 assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM web_task_attachments')).rows[0].n,2);
 await assert.rejects(db.query('INSERT INTO web_task_attachments VALUES($1)',[Buffer.alloc(5_000_001)]),/web_task_attachments_content_check/);
 }finally{await db.close();}
});

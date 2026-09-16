import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {accessRecord,setAccess,recordActivity} from '../lib/admin-store';
import {authorizedEmail} from '../lib/auth';
test('admin access stays server controlled, blocking overrides allowlist and last admin is protected',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool,env=process.env.WEB_ALLOWED_EMAILS;
 try{
 await db.exec('CREATE ROLE anon;CREATE ROLE authenticated');await db.exec(readFileSync(new URL('../sql/008_administration.sql',import.meta.url),'utf8'));
 const query=db.query.bind(db);g.historyPool={query,connect:async()=>({query,release(){}})};
 const admin={id:'a',email:'guih.waltrick@gmail.com'},user={id:'u',email:'user@example.com',user_metadata:{role:'admin',full_name:'Usuário'}};
 process.env.WEB_ALLOWED_EMAILS=user.email;
 assert.equal(await authorizedEmail(user.email),true);
 await recordActivity(user,'login');assert.equal((await accessRecord(user.email)).role,'user');
 await assert.rejects(()=>setAccess({email:user.email,role:'admin',enabled:true},user));
 await setAccess({email:user.email,role:'user',enabled:false},admin);assert.equal(await authorizedEmail(user.email),false);
 await assert.rejects(()=>setAccess({email:admin.email,role:'user',enabled:true},admin),/último administrador/);
 await setAccess({email:user.email,role:'admin',enabled:true},admin);
 assert.equal((await accessRecord(user.email)).role,'admin');
 const r=(await db.query('SELECT last_login_at,display_name FROM web_user_access WHERE email=$1',[user.email])).rows[0] as any;
 assert.ok(r.last_login_at);assert.equal(r.display_name,'Usuário');
 await recordActivity(user,'heartbeat');await recordActivity(user,'logout');
 const events=(await db.query('SELECT event FROM web_access_events WHERE email=$1',[user.email])).rows as any[];
 assert.ok(events.some(e=>e.event==='login'));assert.ok(events.some(e=>e.event==='logout'));assert.ok(!events.some(e=>e.event==='heartbeat'));
 }finally{g.historyPool=old;if(env===undefined)delete process.env.WEB_ALLOWED_EMAILS;else process.env.WEB_ALLOWED_EMAILS=env;await db.close();}
});

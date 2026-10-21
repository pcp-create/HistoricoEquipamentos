import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {claimPasswordResetNotifications,acknowledgePasswordReset,resetWhatsAppPhone,passwordResetMessage} from '../lib/password-reset-notifications';
test('password reset notices use the registered number, canonical login and default password; delivery is claimed once and acknowledged',async()=>{
 assert.equal(resetWhatsAppPhone('(47) 99999-9999'),'5547999999999');assert.equal(resetWhatsAppPhone('123'),null);
 assert.match(passwordResetMessage({email:'user@test.com'}),/https:\/\/rjcompressores.app\/login/);
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 const query:any=db.query.bind(db);g.historyPool={connect:async()=>({query,release(){}})};
 try{
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE web_user_access(email text,display_name text,enabled boolean,phone text,user_id text);');
  await db.exec(readFileSync(new URL('../sql/055_password_reset_notifications.sql',import.meta.url),'utf8'));
  await db.exec("INSERT INTO web_user_access VALUES('user@test.com','Pessoa',true,'5547999999999','identity');INSERT INTO web_password_reset_notifications(email,user_id,phone) VALUES('user@test.com','identity','5547999999999'),('missing@test.com','identity','5547999999999');");
  const notices=await claimPasswordResetNotifications();assert.equal(notices.length,1);
  assert.equal(notices[0].number,'5547999999999');assert.match(notices[0].text,/Assistente RJ/);assert.match(notices[0].text,/user@test.com/);assert.match(notices[0].text,/123456/);assert.match(notices[0].text,/nova senha/);
  assert.equal((await claimPasswordResetNotifications()).length,0);
  await assert.rejects(acknowledgePasswordReset(notices[0].id.slice(15),'10000000-0000-4000-8000-000000000000'));
  await acknowledgePasswordReset(notices[0].id.slice(15),notices[0].token);
  await acknowledgePasswordReset(notices[0].id.slice(15),notices[0].token);
  assert.equal((await query('SELECT state FROM web_password_reset_notifications WHERE id=1')).rows[0].state,'sent');
  await query("INSERT INTO web_password_reset_notifications(email,user_id,phone) VALUES('user@test.com','identity','5547999999998')");
  assert.equal((await claimPasswordResetNotifications()).length,0);
  assert.ok(!(await query('SELECT * FROM web_password_reset_notifications')).rows.some((r:any)=>JSON.stringify(r).includes('123456')));
 }finally{g.historyPool=old;await db.close();}
});

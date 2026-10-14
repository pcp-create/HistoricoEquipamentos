import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { validateNewPassword, changeOwnPassword } from "../lib/password-change";
import { resolveInitialSession } from "../lib/initial-access";

test("new passwords require six characters, confirmation and replacement of the temporary password",()=>{
  const body={currentPassword:"123456",password:"abc123",confirmation:"abc123"};
  validateNewPassword(body);
  for(const invalid of [
    {...body,password:"short",confirmation:"short"},
    {...body,confirmation:"different"},
    {...body,password:"123456",confirmation:"123456"},
    {...body,currentPassword:""},
    {...body,currentPassword:"abc123"},
  ])assert.throws(()=>validateNewPassword(invalid));
});

test("pending password changes hide modules and administrative access",async()=>{
  const result=await resolveInitialSession("token",async()=>Response.json({id:"u",email:"u@test.com",email_confirmed_at:"2026-01-01"}),async()=>({enabled:true,role:"admin",must_change_password:true,modules:["tecnico"]}));
  assert.equal(result.mustChangePassword,true);
  assert.equal(result.admin,false);
  assert.deepEqual(result.modules,[]);
});

test("migration recognizes first access; password changes verify identity, preserve pending on failure and never audit secrets",async()=>{
  const db=new PGlite(),g=globalThis as any,old=g.historyPool;
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated");
    await db.exec(readFileSync(new URL("../sql/008_administration.sql",import.meta.url),"utf8"));
    await db.exec("INSERT INTO web_user_access(email,user_id,updated_by,last_login_at) VALUES('user@test.com','u','test',now())");
    await db.exec(readFileSync(new URL("../sql/049_password_change.sql",import.meta.url),"utf8"));
    assert.equal((await db.query<{must_change_password:boolean}>("SELECT must_change_password FROM web_user_access WHERE email='user@test.com'")).rows[0].must_change_password,false);
    assert.equal((await db.query<{must_change_password:boolean}>("SELECT must_change_password FROM web_user_access WHERE email='guih.waltrick@gmail.com'")).rows[0].must_change_password,true);
    await db.exec("UPDATE web_user_access SET must_change_password=true WHERE email='user@test.com'");
    const query=db.query.bind(db);g.historyPool={query,connect:async()=>({query,release(){}})};
    const user={id:"u",email:"user@test.com"},body={currentPassword:"123456",password:"new-123",confirmation:"new-123"};
    let verified=true,updated=true,matches=true,putCount=0;
    const request=async(endpoint:string,_body?:object,_token?:string,method?:string)=>{
      if(method==="PUT"){putCount++;return Response.json({},{status:updated?200:422});}
      return Response.json({user:{...user,id:matches?"u":"another"},access_token:"fresh"},{status:verified?200:400});
    };
    verified=false;await assert.rejects(changeOwnPassword(body,user,request),/Senha atual/);assert.equal(putCount,0);
    verified=true;matches=false;await assert.rejects(changeOwnPassword(body,user,request));assert.equal(putCount,0);
    matches=true;updated=false;await assert.rejects(changeOwnPassword(body,user,request),/Não foi possível/);
    assert.equal((await db.query<{must_change_password:boolean}>("SELECT must_change_password FROM web_user_access WHERE email=$1",[user.email])).rows[0].must_change_password,true);
    updated=true;await changeOwnPassword(body,user,request);
    assert.equal((await db.query<{must_change_password:boolean}>("SELECT must_change_password FROM web_user_access WHERE email=$1",[user.email])).rows[0].must_change_password,false);
    const events=(await db.query<{event:string}>("SELECT * FROM web_access_events")).rows;
    assert.equal(events.length,1);
    assert.equal(events[0].event,"password_changed");
    assert.ok(!JSON.stringify(events).includes(body.password));
    assert.ok(!JSON.stringify(events).includes(body.currentPassword));
  }finally{g.historyPool=old;await db.close();}
});

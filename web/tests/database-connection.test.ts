import {test} from "node:test";
import assert from "node:assert/strict";
import {pooledDatabaseUrl} from "../lib/database-connection";
test("Supabase session pooling uses transaction pooling without changing credentials or database",()=>{
 for(const port of [":5432",""]){
  const source=new URL("postgres://user:secret@aws-0-region.pooler.supabase.com"+port+"/postgres?application_name=portal");
  const actual=new URL(pooledDatabaseUrl(source.toString()));
  assert.equal(actual.port,"6543");
  actual.port=source.port;
  assert.equal(actual.toString(),source.toString());
 }
});
test("direct, custom and explicit transaction endpoints are preserved",()=>{
 for(const host of ["localhost:5432","db.project.supabase.co:5432","aws-0-region.pooler.supabase.com:6543","pooler.supabase.com.example.org:5432"]){
  const source=new URL("postgres://user:secret@"+host+"/postgres").toString();
  assert.equal(pooledDatabaseUrl(source),source);
 }
});

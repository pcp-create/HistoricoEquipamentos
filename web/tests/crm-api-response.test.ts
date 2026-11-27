import test from "node:test";
import assert from "node:assert/strict";
import {crmApi} from "../components/crm-api";

test("CRM handles HTML failures without leaking parser errors and preserves JSON responses", async () => {
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async()=>new Response("<!DOCTYPE html><html>404</html>",{status:404,headers:{"Content-Type":"text/html"}});
  await assert.rejects(crmApi("?kind=proposals"),/resposta inválida \(HTTP 404\)/);
  globalThis.fetch=async()=>Response.json({rows:[{id:"proposal"}],total:1});
  assert.deepEqual(await crmApi("?kind=proposals"),{rows:[{id:"proposal"}],total:1});
  globalThis.fetch=async()=>Response.json({error:"Sem permissão"},{status:403});
  await assert.rejects(crmApi(),/Sem permissão/);
 }finally{globalThis.fetch=original;}
});

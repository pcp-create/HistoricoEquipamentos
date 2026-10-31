import{test}from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{PGlite}from'@electric-sql/pglite';
import{saveLeakage,leakageDetail,leakageList}from'../lib/leakage-reports/store';
import{POST}from'../app/api/leakage-reports/route';
test('leakage API rejects cross-origin writes before reading a session',async()=>{
 assert.equal((await POST(new Request('http://localhost/api/leakage-reports',{method:'POST',headers:{origin:'https://other.example'}}))).status,403);
});
test('shared leakage history preserves versions, images, source idempotency and concurrent edit protection',async()=>{
 const db=new PGlite(),g=globalThis as any,previous=g.historyPool;
 const query=(sql:string,args?:any[])=>db.query(sql.replace('BEGIN READ WRITE','BEGIN'),args);g.historyPool={query,connect:async()=>({query,release(){}})};
 const document={client:'Temasa',title:'Base Temasa',date:'',pressureBar:7,energyPrice:0.45,machines:[{id:'12345678-1234-4234-8234-123456789abc',name:'GA90',powerKw:90,flowM3min:16.482,hoursPerDay:10,daysPerYear:270}],xml:'<ROOT/>',settings:{empresaInput:'Temasa'}};
 try{
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated');await db.exec(readFileSync('sql/090_leakage_reports.sql','utf8'));
  const first=await saveLeakage({document},'user','workbook:test');assert.equal(first.version,1);
  assert.equal((await saveLeakage({document},'user','workbook:test')).skipped,true);
  const second=await saveLeakage({id:first.id,version:1,document:{...document,energyPrice:0.5}},'other');assert.equal(second.version,2);
  await assert.rejects(saveLeakage({id:first.id,version:1,document},'user'),/alterado/);
  assert.equal((await leakageDetail(first.id,1)).document.energyPrice,0.45);
  assert.equal((await leakageDetail(first.id)).document.energyPrice,0.5);
  assert.equal((await leakageList('Temasa')).rows.length,1);
  await assert.rejects(saveLeakage({id:first.id,version:2,document:{...document,images:[{name:'photo.jpg',assetId:'22345678-1234-4234-8234-123456789abc'}]}},'user'),/imagem/);
  assert.equal((await leakageDetail(first.id)).version,2);
  await assert.rejects(db.exec("UPDATE web_leakage_report_revisions SET created_by='x'"),/imutável/);
 }finally{g.historyPool=previous;await db.close();}
});

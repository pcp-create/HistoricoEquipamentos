import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from '@playwright/test';

test('web sends photos directly, cannot queue new offline work, and preserves/replays legacy pending photos',async()=>{
 let uploads=0, owner="tech";
 const server=createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.url?.startsWith('/field-offline/')){res.setHeader('Content-Type','text/javascript');res.setHeader('Service-Worker-Allowed','/');res.end(readFileSync(new URL('../public'+req.url,import.meta.url)));return;}
  if(req.url==='/tecnico'){res.setHeader('Content-Type','text/html');res.end('<html><body>Portal</body></html>');return;}
  if(req.method==='POST'){for await(const chunk of req){}uploads++;res.end(JSON.stringify({id:String(uploads)}));return;}
  res.end(JSON.stringify({email:owner,rows:[]}));
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch();
 try{
  const context=await browser.newContext();const page=await context.newPage();
  await page.goto('http://127.0.0.1:'+(server.address() as any).port+'/tecnico');
  await page.evaluate(async()=>{
   const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('rj-field-offline-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('records',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   await new Promise<void>((resolve,reject)=>{const t=db.transaction('records','readwrite'),s=t.objectStore('records');s.put({key:'owner',value:'tech'});s.put({key:'tech:queue',value:[{id:'old-photo',type:'photo',operationId:'op',stageId:'s',fieldId:'f',name:'photo.jpg',file:new Blob(['photo'],{type:'image/jpeg'})}]});t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});db.close();
   await navigator.serviceWorker.register('/field-offline/sw.js',{scope:'/'});await navigator.serviceWorker.ready;
   if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));
  });
  const status=()=>page.evaluate(async()=>new Promise<any>(resolve=>{const c=new MessageChannel();c.port1.onmessage=e=>resolve(e.data);navigator.serviceWorker.controller!.postMessage({type:'FIELD_STATUS'},[c.port2]);}));
  assert.equal((await status()).pending,1);
  const identify=()=>page.evaluate(async()=>new Promise<any>(resolve=>{const c=new MessageChannel();c.port1.onmessage=e=>resolve(e.data);navigator.serviceWorker.controller!.postMessage({type:'FIELD_WEB_INIT'},[c.port2]);}));
  owner="other";assert.equal((await identify()).pending,0);
  owner="tech";assert.equal((await identify()).pending,1);

  const photo=()=>page.evaluate(async()=>{try{const form=new FormData();form.set('file',new Blob(['new']),'new.jpg');const r=await fetch('/api/service-scheduling/photos',{method:'POST',body:form});return r.ok;}catch{return false;}});
  assert.equal(await photo(),true);assert.equal(uploads,1);assert.equal((await status()).pending,1);
  await context.setOffline(true);assert.equal(await photo(),false);assert.equal((await status()).pending,1);
  await context.setOffline(false);
  await page.evaluate(async()=>new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=e=>resolve(e.data);navigator.serviceWorker.controller!.postMessage({type:'FIELD_SYNC'},[c.port2]);}));
  assert.equal(uploads,2);assert.equal((await status()).pending,0);
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});

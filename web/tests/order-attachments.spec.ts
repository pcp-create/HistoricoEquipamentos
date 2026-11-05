import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
test('files wait for OS creation; partial upload retains only pending files and lists download links',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const uploads:string[]=[];let rejectSecond=true;
 await page.route('**/api/service-orders/attachments*',r=>{
  if(r.request().method()==='POST'){
   const body=r.request().postDataBuffer()!.toString();uploads.push(body);
   if(body.includes('second.txt')&&rejectSecond){rejectSecond=false;return r.fulfill({status:400,json:{error:'Arquivo recusado'}});}
   return r.fulfill({json:{id:'123'}});
  }
  return r.fulfill({json:{rows:[{id:'123',name:'first.txt'}]}});
 });
 const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Attachments from './components/order-attachments';const root=createRoot(document.getElementById('root'));window.show=(order)=>root.render(<Attachments company="1" order={order}/>);window.show();`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'/tmp/attachments-ui.js',jsx:'automatic',tsconfig:'tsconfig.json'});
 await page.route('**/attachments-fixture',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('/attachments-fixture');
 await page.addScriptTag({content:bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text});
 await page.getByLabel('Adicionar anexos à OS').setInputFiles([{name:'first.txt',mimeType:'text/plain',buffer:Buffer.from('first')},{name:'second.txt',mimeType:'text/plain',buffer:Buffer.from('second')}]);
 await expect(page.getByRole('button',{name:'Enviar anexos ao ERP'})).toHaveCount(0);expect(uploads).toHaveLength(0);
 await page.evaluate(()=> (window as any).show('15128'));
 await page.getByRole('button',{name:'Enviar anexos ao ERP'}).click();
 await expect(page.getByRole('alert')).toHaveText('Arquivo recusado');
 await expect(page.getByRole('button',{name:'Remover anexo first.txt'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Remover anexo second.txt'})).toBeVisible();
 await page.getByRole('button',{name:'Enviar anexos ao ERP'}).click();
 await expect(page.getByRole('status')).toHaveText('Anexos enviados ao ERP.');expect(uploads).toHaveLength(3);
 expect(uploads[2]).not.toContain('first.txt');
 await expect(page.getByRole('link',{name:'first.txt'})).toHaveAttribute('href','/api/service-orders/attachments?company=1&order=15128&id=123');expect(errors).toEqual([]);
});

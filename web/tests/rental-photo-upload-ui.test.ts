import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {chromium,expect} from '@playwright/test';
import {m8ProductPhotoUrl} from '../lib/m8-product-photo-url';

test('rental photos offer M8 upload for empty galleries and after existing images',async()=>{
 assert.equal(m8ProductPhotoUrl('21491'),'https://app.erpm8.cloud/rjcompressores/Estoque/ProdutoFotoQRCodeFormulario//cGVzc29hPTIxNDkxJmVtcHJlc2E9MQ==FotoQrCodeProduto');
 assert.equal(m8ProductPhotoUrl('../bad'),null);
 const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Photo from './components/material-photo';createRoot(document.getElementById('root')).render(<main className="equipment-page"><section id="empty"><Photo id="21491" name="Sem fotos" companies={[2]} compact allowAddPhotos/></section><section id="existing"><Photo id="20988" name="Com foto" companies={[2]} compact allowAddPhotos/></section><section id="other"><Photo id="123" name="Outro produto" companies={[1]} compact/></section></main>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',outdir:'out'});
 const server=createServer((req,res)=>{
  if(req.url?.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({images:req.url.includes('/20988/')?[{key:'one',url:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}]:[]}));return;}
  res.setHeader('Content-Type','text/html');res.end(`<style>${readFileSync('app/globals.css','utf8')}</style><div id="root"></div><script>${bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text}</script>`);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto('http://127.0.0.1:'+(server.address() as any).port);
  const empty=page.locator('#empty').getByRole('link');await expect(empty).toHaveAttribute('href',m8ProductPhotoUrl('21491')!);await expect(empty).toHaveAttribute('target','_blank');
  await expect(page.locator('#other').getByRole('link')).toHaveCount(0);
  const existing=page.locator('#existing');await expect(existing.getByRole('button',{name:'Ampliar foto 1'})).toBeVisible();
  await existing.getByRole('button',{name:'Próxima foto',exact:true}).click();
  await expect(existing.getByRole('link')).toHaveAttribute('href',m8ProductPhotoUrl('20988')!);
  await expect(existing.getByRole('button',{name:'Próxima foto',exact:true})).toBeDisabled();
  await existing.getByRole('button',{name:'Foto anterior',exact:true}).click();
  await existing.getByRole('button',{name:'Ampliar foto 1'}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByRole('img')).toBeVisible();
  await dialog.getByRole('button',{name:'Próxima foto ampliada'}).click();
  await expect(dialog.getByRole('link')).toHaveAttribute('href',m8ProductPhotoUrl('20988')!);
  await expect(dialog.getByRole('img')).toHaveCount(0);
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});

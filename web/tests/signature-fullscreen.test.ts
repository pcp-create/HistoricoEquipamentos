import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
test('signature opens fullscreen with compact controls, confirms clearing and preserves data on cancel or failed upload',async()=>{
 const built=await build({stdin:{contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{SignatureInput}from'./components/checklist-inputs';function App(){const[ids,setIds]=useState([]);return <SignatureInput label="Cliente" ids={ids} disabled={false} onClear={()=>{window.cleared=(window.cleared||0)+1;setIds([])}} onUpload={async file=>{if(window.fail)return false;window.uploads=(window.uploads||0)+1;setIds(['1']);return true;}}/>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'signature.js',jsx:'automatic',platform:'browser'});
 const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('http://signature.test/**',r=>r.request().url().includes('/photos/')?r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64')}):r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
 await page.goto('http://signature.test');await page.addStyleTag({content:built.outputFiles.find(f=>f.path.endsWith('.css'))!.text});await page.addScriptTag({content:built.outputFiles.find(f=>f.path.endsWith('.js'))!.text});
 const open=()=>page.getByRole('button',{name:'Abrir assinatura: Cliente'}).click();
 const editor=page.getByRole('dialog',{name:'Assinatura: Cliente',exact:true});
 await open();const box=(await editor.boundingBox())!;assert.equal(box.width,390);assert.equal(box.height,844);
 const buttons=await editor.locator('footer button').all();const bounds=await Promise.all(buttons.map(b=>b.boundingBox()));assert.ok(bounds.every(b=>b&&b.height<=44&&b.y===bounds[0]!.y));
 await editor.getByRole('button',{name:'Salvar assinatura',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Desenhe');
 async function draw(){const b=(await editor.locator('canvas').boundingBox())!;await page.mouse.move(b.x+20,b.y+40);await page.mouse.down();await page.mouse.move(b.x+160,b.y+90,{steps:8});await page.mouse.up();}
 await draw();await editor.getByRole('button',{name:'Limpar assinatura',exact:true}).click();
 const confirm=page.getByRole('alertdialog',{name:'Limpar assinatura?'});await expect(confirm).toContainText('não pode ser desfeita');await confirm.getByRole('button',{name:'Cancelar',exact:true}).click();
 await page.screenshot({path:'/tmp/signature-fullscreen.png'});
 await editor.getByRole('button',{name:'Salvar assinatura',exact:true}).click();await expect(editor).toHaveCount(0);assert.equal(await page.evaluate(()=>(window as any).uploads),1);
 await open();await editor.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(await page.locator('.signature-card img').count(),1);
 await open();await editor.getByRole('button',{name:'Limpar assinatura',exact:true}).click();await confirm.getByRole('button',{name:'Confirmar limpeza',exact:true}).click();assert.equal(await page.evaluate(()=>(window as any).cleared),1);
 await editor.getByRole('button',{name:'Salvar assinatura',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Desenhe');
 await draw();await page.evaluate(()=>(window as any).fail=true);await editor.getByRole('button',{name:'Salvar assinatura',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Não foi possível salvar');
 await page.setViewportSize({width:844,height:390});await page.waitForTimeout(100);await page.evaluate(()=>(window as any).fail=false);await editor.getByRole('button',{name:'Salvar assinatura',exact:true}).click();await expect(editor).toHaveCount(0);assert.equal(await page.evaluate(()=>(window as any).uploads),2);
 }finally{await browser.close();}
});

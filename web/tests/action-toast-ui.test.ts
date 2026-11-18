import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {chromium,expect} from '@playwright/test';
test('bottom toast keeps errors until dismissed and clears success after three seconds',async()=>{
 const compiled=await build({stdin:{contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import Toast from './components/action-toast';function App(){const [message,setMessage]=useState(''),[type,setType]=useState('error'),[value,setValue]=useState('');return <><button onClick={()=>{setType('error');setMessage('Erro ao salvar checklist');}}>Erro</button><button onClick={()=>{setType('success');setMessage('Salvo com sucesso');}}>Sucesso</button><input aria-label="Continuar editando" value={value} onChange={e=>setValue(e.target.value)}/><Toast message={message} type={type} onClose={()=>setMessage('')}/></>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',outdir:'out'});
 const html=`<style>${compiled.outputFiles.find(f=>f.path.endsWith('.css'))!.text}</style><div id="root"></div><script>${compiled.outputFiles.find(f=>f.path.endsWith('.js'))!.text}</script>`;
 const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{const page=await browser.newPage();await page.clock.install();await page.goto('http://127.0.0.1:'+(server.address() as any).port);
 await page.getByRole('button',{name:'Erro',exact:true}).click();const error=page.getByRole('alert');await expect(error).toContainText('Erro ao salvar checklist');
 const box=await error.boundingBox();assert.ok(box!.y>500);await page.clock.fastForward(10000);await expect(error).toBeVisible();
 await error.getByRole('button',{name:'Fechar notificação'}).click();await expect(error).toHaveCount(0);
 await page.getByRole('button',{name:'Sucesso',exact:true}).click();const success=page.getByRole('status');await expect(success).toContainText('Salvo com sucesso');
 await page.clock.fastForward(2000);await page.getByLabel('Continuar editando').fill('Mais alterações');await expect(success).toBeVisible();
 await page.clock.fastForward(1100);await expect(success).toHaveCount(0);
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});

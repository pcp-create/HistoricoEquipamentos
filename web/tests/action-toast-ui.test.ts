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

test('notifications stack without overlap and remain clickable inside modal dialogs',async()=>{
 const compiled=await build({stdin:{contents:`import React,{useState,useRef}from'react';import{createRoot}from'react-dom/client';import Notice from './components/action-notice';import './components/service-scheduling.css';function App(){const [open,setOpen]=useState(false),[attempts,setAttempts]=useState(0),[message,setMessage]=useState('Primeiro erro');const dialog=useRef(null);return <><button onClick={()=>{setOpen(true);dialog.current.showModal();}}>Abrir edição</button><dialog className="scheduling-page operation-review-window" ref={dialog}><button onClick={()=>{setOpen(false);dialog.current.close();}}>Fechar edição</button><button onClick={()=>setMessage('Outro erro')}>Novo erro</button><button onClick={()=>setMessage('Primeiro erro')}>Repetir erro</button><span>Tentativas: {attempts}</span>{open&&<><Notice onClose={()=>setMessage('')} actions={<button onClick={()=>setAttempts(v=>v+1)}>Tentar novamente</button>}>{message}</Notice><Notice>Segundo erro</Notice></>}</dialog></>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',outdir:'out'});
 const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<style>${compiled.outputFiles.find(f=>f.path.endsWith('.css'))!.text}</style><div id="root"></div><script>${compiled.outputFiles.find(f=>f.path.endsWith('.js'))!.text}</script>`);});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+(server.address() as any).port);
 await page.getByRole('button',{name:'Abrir edição'}).click();const alerts=page.getByRole('alert');await expect(alerts).toHaveCount(2);
 const boxes=await alerts.all();const a=(await boxes[0].boundingBox())!,b=(await boxes[1].boundingBox())!;
 assert.ok(a.y+a.height<=b.y||b.y+b.height<=a.y);assert.ok(Math.max(a.y,b.y)>500);
 await page.setViewportSize({width:390,height:844});
 for(const alert of boxes){const close=alert.getByRole('button',{name:'Fechar notificação'});await expect(close).toHaveCSS('border-top-width','0px');await expect(close).toHaveCSS('background-color','rgba(0, 0, 0, 0)');const toastBox=(await alert.boundingBox())!,closeBox=(await close.boundingBox())!;assert.ok(Math.abs(closeBox.y-toastBox.y-5)<=1);assert.ok(Math.abs(toastBox.x+toastBox.width-closeBox.x-closeBox.width-5)<=1);}

 await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await expect(page.getByText('Tentativas: 1')).toBeVisible();
 await boxes[0].getByRole('button',{name:'Fechar notificação'}).click();await expect(alerts).toHaveCount(1);
 await page.getByRole('button',{name:'Repetir erro',exact:true}).click();await expect(alerts.filter({hasText:'Primeiro erro'})).toBeVisible();await alerts.filter({hasText:'Primeiro erro'}).getByRole('button',{name:'Fechar notificação'}).click();
 await page.getByRole('button',{name:'Novo erro',exact:true}).click();await expect(alerts).toHaveCount(2);await expect(alerts.filter({hasText:'Outro erro'})).toBeVisible();
 await page.getByRole('button',{name:'Fechar edição',exact:true}).click();await expect(alerts).toHaveCount(0);assert.equal(await page.locator('.action-toast-region').count(),0);
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});

test('visit-management errors use the shared dismissible notification',async()=>{
 const compiled=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Screen from './components/sales-visits-management';createRoot(document.getElementById('root')).render(<Screen/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',outdir:'out',loader:{'.png':'dataurl'},plugins:[{name:'navigation',setup(b){b.onResolve({filter:/^(next\/link|next\/navigation|\.\/site-header)$/},args=>({path:args.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='next/link'?`import React from 'react';export default p=>React.createElement('a',p,p.children)`:args.path==='next/navigation'?`export const useSearchParams=()=>new URLSearchParams();export const usePathname=()=>'/visitas/gestao';export const useRouter=()=>({push(){},replace(){},refresh(){}});`:'export default ()=>null',loader:'js',resolveDir:process.cwd()}));}}]});
 const server=createServer((req,res)=>{if(req.url==='/api/visits/management'){res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Acesso de teste indisponível.'}));return;}res.setHeader('Content-Type','text/html');res.end(`<style>${compiled.outputFiles.find(f=>f.path.endsWith('.css'))!.text}</style><div id="root"></div><script>${compiled.outputFiles.find(f=>f.path.endsWith('.js'))!.text}</script>`);});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+(server.address() as any).port);const error=page.getByRole('alert').filter({hasText:'Acesso de teste indisponível.'});await expect(error).toHaveClass(/action-toast--error/);await error.getByRole('button',{name:'Fechar notificação'}).click();await expect(error).toHaveCount(0);}finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});

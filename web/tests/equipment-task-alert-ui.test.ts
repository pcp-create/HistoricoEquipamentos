import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {chromium,expect} from '@playwright/test';

for (const variant of ['preview','stable']) test(`equipment task alerts read without syncing and expire once per failure (${variant})`,async()=>{
 const compiled=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{EquipmentTaskProvider}from './components/tasks-dashboard.${variant}';createRoot(document.getElementById('root')).render(<EquipmentTaskProvider><p>Tela do equipamento</p></EquipmentTaskProvider>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',outdir:'out',loader:{'.png':'dataurl'},plugins:[{name:'navigation',setup(b){b.onResolve({filter:/^(next\/link|next\/navigation|\.\/site-header)$/},args=>({path:args.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='next/link'?`import React from 'react';export default p=>React.createElement('a',p,p.children)`:args.path==='next/navigation'?`export const useSearchParams=()=>new URLSearchParams();export const usePathname=()=>'/equipamentos';export const useRouter=()=>({push(){},replace(){},refresh(){}});`:'export default ()=>null',loader:'js',resolveDir:process.cwd()}));}}]});
 let failing=false,reads=0,writes=0;
 const server=createServer((req,res)=>{
  if(req.url?.startsWith('/api/tasks')){if(req.method==='POST')writes++;else reads++;res.writeHead(failing?503:200,{'Content-Type':'application/json'});res.end(JSON.stringify(failing?{error:'Falha de teste'}:{tasks:[]}));return;}
  res.setHeader('Content-Type','text/html');res.end(`<style>${compiled.outputFiles.find(f=>f.path.endsWith('.css'))!.text}</style><div id="root"></div><script>${compiled.outputFiles.find(f=>f.path.endsWith('.js'))!.text}</script>`);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{
  const page=await browser.newPage();await page.clock.install();await page.goto('http://127.0.0.1:'+(server.address() as any).port);
  await expect.poll(()=>reads).toBe(1);await expect(page.getByRole('alert')).toHaveCount(0);assert.equal(writes,0);
  failing=true;await page.clock.fastForward(60000);const alert=page.getByRole('alert');await expect(alert).toContainText('Tarefas indisponíveis');
  await page.clock.fastForward(4000);await expect(alert).toBeVisible();await page.clock.fastForward(1000);await expect(alert).toHaveCount(0);
  await page.clock.fastForward(60000);await expect.poll(()=>reads).toBe(3);await expect(alert).toHaveCount(0);
  failing=false;await page.clock.fastForward(60000);await expect.poll(()=>reads).toBe(4);
  // Let the successful response clear the failure state before the next poll.
  await page.waitForTimeout(100);
  failing=true;await page.clock.fastForward(60000);await expect(alert).toBeVisible();assert.equal(writes,0);
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});

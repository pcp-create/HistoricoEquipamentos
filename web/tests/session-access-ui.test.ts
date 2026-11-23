import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {chromium,expect} from '@playwright/test';
test('access retains confirmed modules during refresh errors and applies revocation without cross-user cache',async()=>{
 const initial={admin:false,visitManager:false,displayName:'Dupla função',cacheScope:'one:user',cacheUser:'one',modules:['portal-tecnico','visitas'],checkedAt:'2026-11-23T12:00:00Z'};
 const compiled=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{SessionAccessProvider,useSessionAccess}from'./components/session-access';import Picker from './components/employee-access-picker';function Child(){const a=useSessionAccess();return <><div data-testid="modules">{a.modules?.join(',')}</div><div data-testid="time">{a.checkedAt}</div></>}createRoot(document.getElementById('root')).render(<SessionAccessProvider access={window.initial}><Child/></SessionAccessProvider>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',plugins:[{name:'nav',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'nav',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:"export const usePathname=()=>window.location.pathname;"}));}}]});
 let status=503,profile:any=initial,rendered:any=initial;
 const server=createServer((req,res)=>{if(req.url==='/api/session-access'){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(profile));return;}res.setHeader('Content-Type','text/html');res.end(`<div id="root"></div><script>window.initial=${JSON.stringify(rendered)};</script><script>${compiled.outputFiles[0].text}</script>`);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch();
 try{
 const page=await browser.newPage();await page.clock.install();await page.goto('http://127.0.0.1:'+(server.address() as any).port);
 await expect(page.getByTestId('modules')).toHaveText('portal-tecnico,visitas');
 await page.clock.fastForward(61000);await expect(page.getByTestId('modules')).toHaveText('portal-tecnico,visitas');await expect(page.getByTestId('time')).toHaveText(initial.checkedAt);
 status=200;profile={...initial,modules:['visitas'],checkedAt:'2026-11-23T12:02:00Z'};
 await page.clock.fastForward(61000);await expect(page.getByTestId('modules')).toHaveText('visitas');
 assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('rj-access:one')!).modules),['visitas']);
 status=401;await page.clock.fastForward(61000);await expect(page.getByTestId('modules')).toHaveText('');assert.equal(await page.evaluate(()=>sessionStorage.getItem('rj-access:one')),null);
 await page.evaluate(value=>sessionStorage.setItem('rj-access:one',JSON.stringify(value)),initial);
 status=503;rendered={...initial,cacheUser:'two',cacheScope:'two:user',checkedAt:'',modules:[]};
 await page.reload();await expect(page.getByTestId('modules')).toHaveText('');

 // Reproduce the administrator's page surviving the one-minute refresh,
 // including an older response that omits administration from module flags.
 rendered={...initial,admin:true,modules:['crm','administracao']};
 status=200;profile={...rendered,modules:['crm']};
 await page.goto('http://127.0.0.1:'+(server.address() as any).port+'/administracao');
 await expect(page.getByTestId('modules')).toHaveText('crm,administracao');
 for(let minute=0;minute<3;minute++){
  await page.clock.fastForward(61000);
  await expect(page.getByTestId('modules')).toHaveText('crm,administracao');
 }
 assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('rj-access:one')!).modules),['crm','administracao']);
 status=503;await page.clock.fastForward(61000);
 await expect(page.getByTestId('modules')).toHaveText('crm,administracao');
 // A real role revocation must still remove administrative navigation.
 status=200;profile={...profile,admin:false,cacheScope:'one:user'};
 await page.clock.fastForward(61000);
 await expect(page.getByRole('heading',{name:'Módulo não habilitado'})).toBeVisible();

 }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

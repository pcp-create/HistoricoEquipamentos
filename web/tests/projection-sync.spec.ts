import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
test('queues once and refreshes after completion', async ({ page }) => {
 const bundle = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import Button from './components/projection-sync-button';createRoot(document.getElementById('root')).render(<Button onComplete={()=>document.getElementById('done').textContent='Atualizado'}/>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle:true,write:false,jsx:'automatic' });
 await page.route('**/sync-test', r=>r.fulfill({contentType:'text/html',body:`<div id="root"></div><div id="done"></div><script>${bundle.outputFiles[0].text}</script>`}));
 let job: any = null, posts=0, online=true;
 await page.route('**/api/sales-projection/sync', r=>{
  if(r.request().method()==='POST'){ posts++;job={id:'one',state:'queued',stage:'Aguardando integrador'}; }
  return r.fulfill({json:{online,job}});
 });
 await page.goto('/sync-test');
 await page.getByRole('button',{name:'Sincronizar com ERP',exact:true}).click();
 await expect(page.getByRole('button',{name:'Sincronizando…'})).toBeDisabled();
 expect(posts).toBe(1);
 await expect(page.locator('#done')).toHaveText('');
 job={id:'one',state:'complete',stage:'Concluído',finished_at:new Date().toISOString()};
 await expect(page.locator('#done')).toHaveText('Atualizado',{timeout:10000});
 online=false;
 await expect(page.getByRole('button',{name:'Sincronizar com ERP',exact:true})).toBeDisabled({timeout:10000});
 await expect(page.getByText('Integrador manual não está ativo no servidor.')).toBeVisible();
});

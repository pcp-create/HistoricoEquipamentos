import {test,expect} from '@playwright/test';import {build} from 'esbuild';
test('daily equipment cells display a colored badge with the respective workshop only for current stays',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));
 const schedules=[{id:'1',order_id:'15137',cliente_nome:'Cliente',calendar_operations:[1,2,3].map(n=>({id:String(n),position:n,date:'2026-11-05',time:'07:30',responsible:'Ana',equipmentId:String(n),equipment:{label:'Máquina '+n},workshop:n<3?{name:n===1?'Rio do Sul':'Lages'}:null}))}];
 const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Calendar from './components/schedule-orders-calendar';createRoot(document.getElementById('root')).render(<Calendar schedules={${JSON.stringify(schedules)}}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outdir:'/tmp/schedule-workshop-ui',jsx:'automatic'});
 await page.route('**/workshop-badge-test',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('/workshop-badge-test');await page.addStyleTag({content:bundle.outputFiles.find(f=>f.path.endsWith('.css'))!.text});await page.addScriptTag({content:bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text});
 await page.getByRole('button',{name:'Dia',exact:true}).click();
 const rows=page.locator('.schedule-daily-table tbody tr');await expect(rows).toHaveCount(3);
 await expect(rows.nth(0).locator('.schedule-equipment-workshop')).toHaveText('Em oficina · Rio do Sul');await expect(rows.nth(1).locator('.schedule-equipment-workshop')).toHaveText('Em oficina · Lages');await expect(rows.nth(2).locator('.schedule-equipment-workshop')).toHaveCount(0);
 await expect(rows.nth(0).locator('.schedule-equipment-workshop')).toHaveCSS('background-color','rgb(255, 243, 214)');await expect(rows.nth(0).locator('.schedule-equipment-workshop')).toHaveCSS('color','rgb(134, 82, 11)');
});

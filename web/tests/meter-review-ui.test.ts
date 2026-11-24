import {test} from 'node:test';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {chromium,expect} from '@playwright/test';

test('operation review permits an older smaller reading and blocks same-day or newer smaller readings',async()=>{
 const compiled=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Window from './components/operation-review-window';
 const date=new URL(location.href).searchParams.get('date');const run={meterDate:date,template:{name:'Relatório',items:[],stages:[{id:'s',name:'Medições',fields:[{id:'m',label:'Horímetro total',type:'meter'}]}]},stages:{s:{status:'submitted',answers:{m:37708}}},submission:{at:'2026-11-11',by:'tech'}};
 const operation={id:'op',position:1,version:1,status:'awaiting_review',document:{equipmentId:'7',checklistId:'t',checklistRun:run}};
 const data={canEditSettings:true,schedule:{id:'1',order_id:'15328'},detail:{order:{numero_sequencia:15328},materials:[]},operations:[operation],events:[],fieldSessions:[],fieldEvents:[],requests:[],usage:[],users:[]};
 createRoot(document.getElementById('root')).render(<Window embedded operation={operation} data={data} busy={false} dirty={false} mutate={(x)=>{window.reviewRequest=x;return Promise.resolve(true)}} onClose={()=>{}}/>);`,resolveDir:process.cwd(),loader:'tsx'},plugins:[{name:'stub-unrelated-review-components',setup(b){b.onResolve({filter:/^\.\/(action-notice|operation-equipment-select|order-task-window|checklist-review-report|schedule-time-logs)$/},()=>({path:'stub',namespace:'test-stub'}));b.onLoad({filter:/.*/,namespace:'test-stub'},()=>({contents:'export default function Stub(){return null}',loader:'js'}));}}],bundle:true,write:false,outfile:'app.js',platform:'browser',jsx:'automatic'});
 const server=createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(compiled.outputFiles.find(f=>f.path.endsWith('.js'))!.text);}else res.end('<div id="root"></div><script src="/app.js"></script>');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch();
 try{for(const scenario of [{date:'2026-11-10',allowed:true},{date:'2026-11-11',allowed:false},{date:'2026-11-12',allowed:false}]){
  const page=await browser.newPage();await page.route('**/api/service-scheduling/equipment?reading=7',r=>r.fulfill({json:{meter:37922,meterDate:'2026-11-11'}}));await page.goto(`http://127.0.0.1:${(server.address() as any).port}/?date=${scenario.date}`);
  const button=page.getByRole('button',{name:'Concluir revisão',exact:true});await expect(page.getByText('OS 15328/01')).toBeVisible();
  if(scenario.allowed){await expect(button).toBeEnabled();await expect(page.getByText('Horímetro abaixo da última coleta')).toHaveCount(0);await button.click();await expect.poll(()=>page.evaluate(()=>(window as any).reviewRequest?.action)).toBe('review');}
  else {await expect(page.getByText('Horímetro abaixo da última coleta')).toBeVisible();await expect(button).toBeDisabled();}
  await page.close();
 }}finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

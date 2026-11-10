import {test} from 'node:test';import {build} from 'esbuild';import {chromium,expect} from '@playwright/test';
test('technician time actions disappear after personal closure or operation finish while history and planner corrections remain accessible',async()=>{
 const compiled=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Logs from './components/schedule-time-logs';const root=createRoot(document.getElementById('root'));window.render=(status,submitted,planner=false)=>root.render(<Logs technician={!planner} data={{email:'tech',canEditSettings:planner,operations:[{id:'op',position:1,status,document:{description:'Operação',responsible:'tech',support:['helper'],technicianClosures:submitted?{tech:{at:'2026-11-10'}}:{},checklistRun:submitted?{submission:{at:'2026-11-09T12:00:00Z',by:'tech'}}:undefined}}],fieldSessions:[{id:'session',operation_id:'op',actor:'tech',kind:'work',state:'finished',started_at:'2026-11-09T10:00:00Z',finished_at:'2026-11-09T11:00:00Z',active_seconds:3600,pause_seconds:0}],fieldEvents:[],events:[],requests:[],users:[]}}/>);window.render('executing',false);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',loader:{'.css':'empty'}});
 const browser=await chromium.launch();try{
  const page=await browser.newPage();await page.setContent('<div id="root"></div>');await page.addScriptTag({content:compiled.outputFiles[0].text});
  await expect(page.getByRole('button',{name:'Solicitar ajuste',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Replicar apontamento',exact:true})).toBeVisible();
  for(const [status,submitted] of [['executing',true],['awaiting_review',false],['reviewed',false],['completed',false]] as const){
   await page.evaluate(([status,submitted])=>(window as any).render(status,submitted),[status,submitted]);
   for(const name of ['Incluir apontamento manual','Solicitar ajuste','Replicar apontamento'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
   await expect(page.getByText('Operação 01 · Operação',{exact:true})).toBeVisible();
  }
  await page.evaluate(()=>(window as any).render('awaiting_review',true,true));
  await expect(page.getByRole('button',{name:'Ajustar horas',exact:true})).toBeVisible();
 }finally{await browser.close();}
});

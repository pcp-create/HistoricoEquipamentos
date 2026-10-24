import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
test.use({hasTouch:false,viewport:{width:390,height:844}});
for(const mode of ['date','time','datetime'])test(`custom ${mode} picker confirms, cancels and clears without changing local values`,async({page})=>{
 const bundle=await build({stdin:{contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import Picker from './components/date-time-picker';function App(){const [value,setValue]=useState(${JSON.stringify(mode==='date'?'2026-10-24':mode==='time'?'08:00':'2026-10-24T08:00')});return <><Picker label="Agendamento" mode="${mode}" value={value} onChange={setValue}/><output>{value}</output></>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outdir:'out',jsx:'automatic'});
 const js=bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text;
 const css=bundle.outputFiles.find(f=>f.path.endsWith('.css'))!.text+readFileSync('app/form-controls.css','utf8');
 await page.route('**/picker-test',r=>r.fulfill({contentType:'text/html',body:`<style>${css}</style><div id="root"></div><script>${js}</script>`}));
 await page.goto('/picker-test');
 const initial=await page.locator('output').textContent();
 await page.getByRole('textbox',{name:'Agendamento',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog).toBeVisible();
 const bounds=await dialog.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390);
 if(mode!=='time')await page.getByRole('button',{name:'25/10/2026',exact:true}).click();
 if(mode!=='date'){await page.getByRole('textbox',{name:'Hora',exact:true}).fill('14');await page.getByRole('textbox',{name:'Minutos',exact:true}).fill('35');}
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 await expect(page.locator('output')).toHaveText(initial!);
 await page.getByRole('textbox',{name:'Agendamento',exact:true}).click();
 if(mode!=='time')await page.getByRole('button',{name:'25/10/2026',exact:true}).click();
 if(mode!=='date'){
  await page.getByRole('textbox',{name:'Hora',exact:true}).fill('25');
  await expect(page.getByRole('button',{name:'Confirmar',exact:true})).toBeDisabled();
  await page.getByRole('textbox',{name:'Hora',exact:true}).fill('14');
  await page.getByRole('textbox',{name:'Minutos',exact:true}).fill('35');
 }
 await page.getByRole('button',{name:'Confirmar',exact:true}).click();
 await expect(page.locator('output')).toHaveText(mode==='date'?'2026-10-25':mode==='time'?'14:35':'2026-10-25T14:35');
 await page.getByRole('textbox',{name:'Agendamento',exact:true}).click();
 await page.getByRole('button',{name:'Limpar',exact:true}).click();
 await expect(page.locator('output')).toHaveText('');
});

test.describe('native mobile controls',()=>{
 test.use({hasTouch:true,isMobile:true,viewport:{width:390,height:844}});
 test('visits use datetime-local and operation icons use native date/time while retaining typing',async({page})=>{
  const bundle=await build({stdin:{contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import Picker from './components/date-time-picker';function App(){const [date,setDate]=useState('2026-10-24'),[time,setTime]=useState('08:00'),[visit,setVisit]=useState('2026-10-24T08:00');return <><Picker label="Visita" value={visit} onChange={setVisit}/><Picker editable mode="date" label="Operação" value={date} onChange={setDate}/><Picker editable mode="time" label="Início" value={time} onChange={setTime}/><output>{date+' '+time+' '+visit}</output></>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outdir:'out',jsx:'automatic'});
  await page.route('**/picker-test',r=>r.fulfill({contentType:'text/html',body:`<style>${bundle.outputFiles.find(f=>f.path.endsWith('.css'))!.text}</style><div id="root"></div><script>${bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text}</script>`}));
  await page.goto('/picker-test');
  const visit=page.getByLabel('Visita',{exact:true}),date=page.getByLabel('Abrir calendário: Operação'),time=page.getByLabel('Abrir horário: Início');
  await expect(visit).toHaveAttribute('type','datetime-local');
  await expect(date).toHaveAttribute('type','date');await expect(time).toHaveAttribute('type','time');
  await visit.fill('2026-10-25T09:30');await date.fill('2026-10-26');await time.fill('10:15');
  await expect(page.getByLabel('Operação',{exact:true})).toHaveValue('26/10/2026');
  await expect(page.getByLabel('Início',{exact:true})).toHaveValue('10:15');
  await page.getByLabel('Operação',{exact:true}).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Operação',{exact:true}).fill('27102026');await page.getByLabel('Operação',{exact:true}).blur();
  await expect(date).toHaveValue('2026-10-27');
  await expect(page.locator('output')).toHaveText('2026-10-27 10:15 2026-10-25T09:30');
 });
});

import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
test.use({hasTouch:true,viewport:{width:390,height:844}});
for(const mode of ['date','time','datetime'])test(`mobile ${mode} picker confirms, cancels and clears without changing local values`,async({page})=>{
 const bundle=await build({stdin:{contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import Picker from './components/date-time-picker';function App(){const [value,setValue]=useState(${JSON.stringify(mode==='date'?'2026-10-24':mode==='time'?'08:00':'2026-10-24T08:00')});return <><Picker label="Agendamento" mode="${mode}" value={value} onChange={setValue}/><output>{value}</output></>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outdir:'out',jsx:'automatic'});
 const js=bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text;
 const css=bundle.outputFiles.find(f=>f.path.endsWith('.css'))!.text+readFileSync('app/form-controls.css','utf8');
 await page.route('**/picker-test',r=>r.fulfill({contentType:'text/html',body:`<style>${css}</style><div id="root"></div><script>${js}</script>`}));
 await page.goto('/picker-test');
 const initial=await page.locator('output').textContent();
 await page.getByRole('textbox',{name:'Agendamento',exact:true}).tap();
 const dialog=page.getByRole('dialog');
 await expect(dialog).toBeVisible();
 const bounds=await dialog.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390);
 if(mode!=='time')await page.getByRole('button',{name:'25/10/2026',exact:true}).tap();
 if(mode!=='date'){await page.getByRole('textbox',{name:'Hora',exact:true}).fill('14');await page.getByRole('textbox',{name:'Minutos',exact:true}).fill('35');}
 await page.getByRole('button',{name:'Cancelar',exact:true}).tap();
 await expect(page.locator('output')).toHaveText(initial!);
 await page.getByRole('textbox',{name:'Agendamento',exact:true}).tap();
 if(mode!=='time')await page.getByRole('button',{name:'25/10/2026',exact:true}).tap();
 if(mode!=='date'){
  await page.getByRole('textbox',{name:'Hora',exact:true}).fill('25');
  await expect(page.getByRole('button',{name:'Confirmar',exact:true})).toBeDisabled();
  await page.getByRole('textbox',{name:'Hora',exact:true}).fill('14');
  await page.getByRole('textbox',{name:'Minutos',exact:true}).fill('35');
 }
 await page.getByRole('button',{name:'Confirmar',exact:true}).tap();
 await expect(page.locator('output')).toHaveText(mode==='date'?'2026-10-25':mode==='time'?'14:35':'2026-10-25T14:35');
 await page.getByRole('textbox',{name:'Agendamento',exact:true}).tap();
 await page.getByRole('button',{name:'Limpar',exact:true}).tap();
 await expect(page.locator('output')).toHaveText('');
});

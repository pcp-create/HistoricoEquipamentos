import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {chromium,expect} from '@playwright/test';
test('mobile slicers select multiple jobs independently from module access',async()=>{
 const compiled=await build({stdin:{contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import Picker from './components/employee-access-picker';import './components/admin-dashboard.css';function App(){const [value,setValue]=useState({enabled:true,job_titles:[],modules:[]});return <><Picker value={value} onChange={setValue}/><output>{JSON.stringify(value)}</output></>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outdir:'out',jsx:'automatic'});
 const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${compiled.outputFiles.find(f=>f.path.endsWith('.css'))!.text}</style><div id="root"></div><script>${compiled.outputFiles.find(f=>f.path.endsWith('.js'))!.text}</script>`);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch();
 try{const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto('http://127.0.0.1:'+(server.address() as any).port);
 await page.getByRole('button',{name:'Adicionar cargos',exact:true}).click();
 for(const name of ['Técnico','Vendedor']){await page.getByRole('button',{name,exact:true}).click();}
 await page.keyboard.press('Escape');
 for(const name of ['Portal técnico','Portal do vendedor / Visitas']){await page.getByRole('switch',{name,exact:true}).click();await expect(page.getByRole('switch',{name,exact:true})).toHaveAttribute('aria-checked','true');}
 let value=JSON.parse((await page.locator('output').textContent())!);assert.deepEqual(value.job_titles,['Técnico','Vendedor']);assert.deepEqual(value.modules,['portal-tecnico','visitas']);
 await page.getByRole('switch',{name:'Portal técnico',exact:true}).click();await expect(page.getByRole('button',{name:'Remover cargo Técnico',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Adicionar cargos',exact:true}).click();
 await page.getByLabel('Pesquisar cargo').fill('Consultor');
 await page.getByLabel('Pesquisar cargo').press('Enter');
 await expect(page.getByRole('button',{name:'Remover cargo Consultor',exact:true})).toBeVisible();
 await page.getByLabel('Pesquisar cargo').fill('  tecnico  ');
 await page.getByLabel('Pesquisar cargo').press('Enter');
 value=JSON.parse((await page.locator('output').textContent())!);
 assert.deepEqual(value.job_titles,['Técnico','Vendedor','Consultor']);
 await page.getByLabel('Pesquisar cargo').fill('Coordenador');
 await page.getByRole('button',{name:'Adicionar “Coordenador”',exact:true}).click();
 await expect(page.getByRole('button',{name:'Remover cargo Coordenador',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');

 const box=await page.locator('.employee-access-picker').boundingBox();assert.ok(box!.width<=390);
 }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

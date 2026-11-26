import {test} from 'node:test';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {chromium,expect} from '@playwright/test';

test('lead selector displays name and city without exposing its identifier',async()=>{
 const bundle=await build({stdin:{contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import Picker from './components/order-search-select';function App(){const [row,setRow]=useState({id:'',name:''});return <Picker label="Lead" hideId endpoint="/leads" value={row.id} selectedLabel={row.name} onChange={setRow}/>};createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'app.js',jsx:'automatic',loader:{'.css':'empty'}});
 const server=createServer((req,res)=>{if(req.url?.startsWith('/leads')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({rows:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Água Mineral',city:'Joaçaba',uf:'SC'}],total:1}));return;}res.end(`<div id="root"></div><script>${bundle.outputFiles[0].text}</script>`)});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch();
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+(server.address() as any).port);await page.getByRole('combobox',{name:'Lead'}).click();const option=page.getByRole('option',{name:/Água Mineral/});await expect(option).toContainText('Joaçaba / SC');await expect(option).not.toContainText('aaaaaaaa');await option.click();await expect(page.getByRole('combobox',{name:'Lead'})).toHaveValue('Água Mineral');}finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()))}
});

import {test} from 'node:test';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {chromium,expect} from '@playwright/test';

test('catalog items show equipment, customer or general sale according to the selected history',async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Row from './components/quote-item-row';
 const sale={company:'1',order:'1',date:'2026-01-01',quantity:'1',unitPrice:'300',total:'300'};
 const item={kind:'material',key:'catalog:50',code:'50',name:'Filtro',unit:'UN',quantity:'1',price:'400',selected:true,source:'Base geral',referencePrice:'500',minimumPrice:'100',lastPrice:'',referenceAt:'',generalSale:sale};
 function App(){const[scope,setScope]=useState('customer');return <><select aria-label="Escopo" value={scope} onChange={e=>setScope(e.target.value)}><option>customer</option><option>equipment</option><option>general</option></select><Row item={item} compactPricing onChange={()=>{}} history={scope==='general'?undefined:{scope,count:1,minimum:'200',maximum:'200',rows:[{...sale,unitPrice:'200',total:'200'}]}}/></>};createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,loader:{'.css':'empty'},jsx:'automatic',define:{'process.env':'{}'}});
 const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script>'+bundle.outputFiles[0].text+'</script>');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch();
 try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:'+(server.address() as any).port);
 await expect(page.getByText('Última venda · cliente',{exact:true})).toBeVisible();
 await expect(page.getByText('Última venda · base geral',{exact:true})).toHaveCount(0);
 await page.getByLabel('Escopo').selectOption('equipment');
 await expect(page.getByText('Última venda · cliente/equipamento',{exact:true})).toBeVisible();
 await page.getByLabel('Escopo').selectOption('general');
 await expect(page.getByText('Última venda · base geral',{exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Valor unitário (R$)',exact:true})).toHaveValue('400,00');
 }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

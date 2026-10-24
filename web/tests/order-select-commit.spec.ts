import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
test.use({hasTouch:true,viewport:{width:390,height:844}});
test('one tap commits an option inside a label and closes the list',async({page})=>{
 const bundle=await build({stdin:{contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import Select from './components/order-search-select';function App(){const [value,setValue]=useState('');return <label>Finalidade da Visita<Select label="Finalidade da Visita" value={value} options={[{id:'1',name:'Prospecção'},{id:'2',name:'Manutenção'}]} onChange={row=>setValue(row.id)}/></label>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outdir:'out',jsx:'automatic'});
 await page.route('**/picker-test',r=>r.fulfill({contentType:'text/html',body:`<style>${bundle.outputFiles.find(f=>f.path.endsWith('.css'))!.text}</style><div id="root"></div><script>${bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text}</script>`}));
 await page.goto('/picker-test');
 const field=page.getByRole('combobox',{name:'Finalidade da Visita'});
 await field.tap();await field.fill('Prospec');
 await page.getByRole('option',{name:/Prospecção/}).locator('strong').tap();
 await expect(field).toHaveValue('Prospecção');
 await expect(field).toHaveAttribute('aria-expanded','false');
 await expect(page.getByRole('listbox')).toHaveCount(0);
 await field.tap();await page.getByRole('option',{name:/Manutenção/}).click();
 await expect(field).toHaveValue('Manutenção');await expect(page.getByRole('listbox')).toHaveCount(0);
 await field.focus();await field.press('ArrowDown');await field.press('Enter');
 await expect(field).toHaveValue('Prospecção');await expect(page.getByRole('listbox')).toHaveCount(0);
});

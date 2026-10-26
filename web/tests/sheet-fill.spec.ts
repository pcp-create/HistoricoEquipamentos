import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
test('drag copies only rendered rows and Escape cancels',async({page})=>{
 const bundle=await build({stdin:{contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import Cell from './components/sheet-fill-cell';import './components/territory-sheet.css';function App(){const [rows,setRows]=useState(['Ana','Hidden','Bruno','Carlos']);return <div className="territory-sheet"><div className="territory-sheet-scroll"><table><tbody>{[0,2,3].map((id,index)=><tr key={id}><Cell column="seller" rowIndex={index} editable onFill={last=>setRows(current=>current.map((value,i)=>[0,2,3].slice(index+1,last+1).includes(i)?rows[id]:value))}><input aria-label={'row'+id} value={rows[id]} readOnly/></Cell></tr>)}</tbody></table></div><output>{rows.join(',')}</output></div>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outdir:'out',jsx:'automatic'});
 await page.route('**/fill-test',r=>r.fulfill({contentType:'text/html',body:`<style>${bundle.outputFiles.find(f=>f.path.endsWith('.css'))!.text}</style><div id="root"></div><script>${bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text}</script>`}));
 await page.goto('/fill-test');
 const drag=async()=>{await page.locator('td').first().hover();const from=await page.locator('.territory-fill-handle').first().boundingBox();const to=await page.locator('td').last().boundingBox();await page.mouse.move(from!.x+4,from!.y+4);await page.mouse.down();await page.mouse.move(to!.x+20,to!.y+10,{steps:5});};
 await drag();await page.keyboard.press('Escape');await page.mouse.up();await expect(page.locator('output')).toHaveText('Ana,Hidden,Bruno,Carlos');
 await drag();await page.mouse.up();await expect(page.locator('output')).toHaveText('Ana,Hidden,Ana,Ana');
});

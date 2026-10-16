import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
test('long text grows, shrinks and resizes when a saved field becomes visible',async()=>{
 const compiled=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Text from './components/auto-resize-textarea';function App(){const [value,setValue]=React.useState('Curto');return <><Text aria-label="Texto" value={value} onChange={e=>setValue(e.target.value)}/><details><summary>Abrir</summary><Text aria-label="Salvo" value={'Texto salvo longo. '.repeat(150)} readOnly/></details></>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic'});
 const browser=await chromium.launch();try{
  const page=await browser.newPage();await page.setContent('<style>textarea{box-sizing:border-box;width:300px;min-height:90px;padding:12px;border:1px solid;line-height:20px;font:16px Arial}</style><div id="root"></div>');await page.addScriptTag({content:compiled.outputFiles[0].text});
  const field=page.getByLabel('Texto');await field.waitFor();const small=(await field.boundingBox())!.height;
  await field.fill('Linha de texto preenchido.\n'.repeat(30));
  assert.ok((await field.boundingBox())!.height>small);
  assert.ok(await field.evaluate(e=>e.scrollHeight<=e.clientHeight+1));
  await field.fill('Curto');assert.equal((await field.boundingBox())!.height,small);
  await page.getByText('Abrir',{exact:true}).click();
  await page.waitForFunction(()=>{const e=document.querySelector('[aria-label="Salvo"]') as HTMLTextAreaElement;return e.clientHeight>90&&e.scrollHeight<=e.clientHeight+1});
 }finally{await browser.close()}
});

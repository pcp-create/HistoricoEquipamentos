import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
test.use({hasTouch:true,viewport:{width:390,height:844}});
for(const label of ['Equipe de Apoio 01','Gestores para aprovação']) {
 test(`${label}: touch selection survives search blur`,async({page})=>{
  const bundle=await build({stdin:{contents:`
   import React,{useState} from 'react';
   import {createRoot} from 'react-dom/client';
   import SupportPicker from './components/support-picker';
   function App(){const [selected,setSelected]=useState([]);return <><h1>Cadastro</h1><SupportPicker label={${JSON.stringify(label)}} filterLabel="Pesquisar usuário" users={[{email:'ana@test.com',display_name:'Ana'},{email:'bruno@test.com',display_name:'Bruno'}]} selected={selected} onChange={setSelected}/><output>{selected.join(',')}</output></>}
   createRoot(document.getElementById('root')).render(<App/>);
  `,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outdir:'out',jsx:'automatic'});
  const js=bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text;
  const css=bundle.outputFiles.find(f=>f.path.endsWith('.css'))!.text;
  await page.route('**/picker-test',r=>r.fulfill({contentType:'text/html',body:`<style>${css}</style><div id="root"></div><script>${js}</script>`}));
  await page.goto('/picker-test');
  await page.getByRole('button',{name:label,exact:true}).tap();
  const search=page.getByRole('textbox',{name:'Pesquisar usuário'});
  await search.fill('Bruno');
  // Safari may blur with relatedTarget=null before delivering the tap's click.
  await search.evaluate((el:HTMLInputElement)=>el.blur());
  await page.getByRole('button',{name:'Bruno',exact:true}).tap();
  await expect(page.locator('output')).toHaveText('bruno@test.com');
  await expect(page.getByRole('button',{name:'Bruno',exact:true})).toHaveAttribute('aria-pressed','true');
  await search.fill('Ana');
  await page.getByRole('button',{name:'Ana',exact:true}).tap();
  await expect(page.locator('output')).toHaveText('bruno@test.com,ana@test.com');
  await page.getByRole('heading',{name:'Cadastro'}).tap();
  await expect(search).toHaveCount(0);
  await page.getByRole('button',{name:'Remover apoio Bruno'}).tap();
  await expect(page.locator('output')).toHaveText('ana@test.com');
 });
}

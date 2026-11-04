import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
test('administrator deactivates, reactivates and deletes an employee with confirmation',async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/activity',r=>r.fulfill({json:{admin:true}}));
 let employee:any={email:'user@example.com',display_name:'Funcionário teste',role:'user',enabled:true};
 const writes:string[]=[];
 await page.route('**/api/admin',r=>{
  if(r.request().method()==='POST'){
   const b=r.request().postDataJSON();writes.push(b.action);
   if(b.action==='delete')employee=null;else employee.enabled=b.action==='reactivate';
   return r.fulfill({json:{saved:true}});
  }
  return r.fulfill({json:{email:'admin@example.com',users:employee?[employee]:[],events:[],orders:[],products:[],equipment:[],runs:[]}});
 });
 // Render the real component in isolation; the administration page requires a real server session.
 const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Admin from './components/admin-dashboard.preview';createRoot(document.getElementById('root')).render(<Admin/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'/tmp/admin-lifecycle.js',jsx:'automatic',tsconfig:'tsconfig.json',plugins:[{name:'navigation-fixture',setup(b){b.onResolve({filter:/^\.\/site-header$/},()=>({path:'header',namespace:'fixture'}));b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default function Header(){return null};export const useSearchParams=()=>new URLSearchParams();',loader:'js'}));}}]});
 await page.route('**/admin-lifecycle-fixture',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
 await page.goto('/admin-lifecycle-fixture');
 await page.addScriptTag({content:bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text});
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Desativar',exact:true}).click();
 await expect(page.getByRole('button',{name:'Reativar',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Reativar',exact:true}).click();
 await expect(page.getByRole('button',{name:'Desativar',exact:true})).toBeEnabled();
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Excluir',exact:true}).click();
 expect(writes).toEqual(['deactivate','reactivate']);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Excluir',exact:true}).click();
 await expect(page.getByRole('button',{name:'Excluir',exact:true})).toHaveCount(0);
 expect(writes).toEqual(['deactivate','reactivate','delete']);expect(errors).toEqual([]);
});

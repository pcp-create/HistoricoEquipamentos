import {test,expect} from '@playwright/test';
test('workshop imported entry offers an existing active equipment link and refreshes the same visit',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 const visit:any={id:'10000000-0000-4000-8000-000000000001',equipment_id:null,name:'Compressor BQD0118788',client:'BLUE FOREST',workshop_id:'2',workshop:'RJ Serrana',entered_at:'2026-09-29T03:00:00Z',stage:'repair',effective_stage:'repair',version:2,source:{customer:'BLUE FOREST'},orders:[],tasks:[],quotes:[],drafts:[],external:[],events:[]};
 let saved:any,kind='';
 await page.route('**/api/**',r=>r.fulfill({json:{}}));
 await page.route('**/api/workshop*',r=>{
  const p=new URL(r.request().url()).searchParams;
  if(p.has('q')){kind=p.get('kind')||'';return r.fulfill({json:{rows:[{id:'17431',name:'Compressor ativo',serial:'BQD0118788',client:'BLUE FOREST'}]}});}
  if(r.request().method()==='POST'){saved=r.request().postDataJSON();visit.equipment_id='17431';visit.name='Compressor ativo';visit.serial='BQD0118788';visit.version++;return r.fulfill({json:{saved:true}});}
  return r.fulfill({json:{workshops:[{id:'2',name:'RJ Serrana',active:true}],visits:[visit],external:[]}});
 });
 await page.goto('/oficina');
 await page.getByRole('button',{name:'Abrir null',exact:true}).click();
 await page.getByRole('button',{name:'Vincular ao cadastro',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Vincular ao cadastro',exact:true});
 await expect(dialog.getByRole('button',{name:'Confirmar vínculo'})).toBeDisabled();
 await dialog.getByPlaceholder('Código, modelo ou número de série').fill('BQD0118788');
 await dialog.getByRole('button',{name:/17431 - Compressor ativo/}).click();
 await dialog.getByRole('button',{name:'Confirmar vínculo',exact:true}).click();
 await expect(dialog).toHaveCount(0);expect(kind).toBe('link-equipment');expect(saved).toMatchObject({action:'link-equipment',id:visit.id,equipmentId:'17431',version:2});
 const drawer=page.getByRole('dialog',{name:'Ficha da máquina',exact:true});await expect(drawer).toContainText('EQUIPAMENTO 17431');await expect(drawer).toContainText('29/09/2026');await expect(drawer.getByRole('button',{name:'Vincular ao cadastro',exact:true})).toHaveCount(0);
});

import {test,expect} from '@playwright/test';
test('workshop reversal asks for a reason and remains visible in history',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 const visit:any={id:'10000000-0000-4000-8000-000000000001',equipment_id:'100',name:'Compressor teste',workshop_id:'1',workshop:'RJ Compressores',entered_at:'2026-10-01T12:00:00Z',stage:'received',effective_stage:'received',version:1,orders:[],tasks:[],quotes:[],drafts:[],external:[],events:[]};
 let saved:any;
 await page.route('**/api/**',r=>r.fulfill({json:{}}));
 await page.route('**/api/workshop',r=>{
  if(r.request().method()==='POST'){
   saved=r.request().postDataJSON();visit.reconciled_out_at='2026-10-29T12:00:00Z';visit.reconciliation_reason=saved.notes;visit.source={entry_reversed:true};visit.version++;
   visit.events=[{id:'1',action:'Entrada estornada',created_at:visit.reconciled_out_at,actor_name:'Ana',document:{notes:saved.notes}}];
   return r.fulfill({json:{saved:true}});
  }
  return r.fulfill({json:{workshops:[{id:'1',name:'RJ Compressores',active:true}],visits:[visit],external:[]}});
 });
 await page.goto('/oficina');
 await page.getByRole('button',{name:'Abrir 100',exact:true}).click();
 await page.getByRole('button',{name:'Estornar entrada',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Estornar entrada de equipamento'});
 await dialog.getByRole('button',{name:'Confirmar estorno'}).click();expect(saved).toBeUndefined();
 await dialog.getByLabel('Justificativa do estorno *',{exact:true}).fill('Entrada em duplicidade');
 await dialog.getByRole('button',{name:'Confirmar estorno'}).click();
 await expect(dialog).toHaveCount(0);expect(saved.action).toBe('reverse');expect(saved.notes).toBe('Entrada em duplicidade');
 await expect(page.getByRole('dialog',{name:'Ficha da máquina'})).toContainText('Entrada estornada');
 await expect(page.getByRole('button',{name:'Estornar entrada',exact:true})).toHaveCount(0);
 await page.getByRole('dialog',{name:'Ficha da máquina'}).getByRole('button',{name:'Histórico',exact:true}).click();
 await expect(page.locator('.ws-timeline')).toContainText('Entrada em duplicidade');
});

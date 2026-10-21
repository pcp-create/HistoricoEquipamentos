import {test,expect} from '@playwright/test';
test('save to database, reopen for editing and generate PDF from list',async({page})=>{
 const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHfsAAAAASUVORK5CYII=';
 const id='10000000-0000-4000-8000-000000000001';let record:any=null;
 await page.route('**/api/vibration-reports**',async r=>{
  const url=new URL(r.request().url());
  if(url.searchParams.has('customers'))return r.fulfill({json:{customers:[{companyId:1,personId:'42',name:'ITUTEX',document:'123456',city:'Lages',uf:'SC'}],hasMore:false}});
  if(r.request().method()==='POST'){
   if(r.request().headers()['content-type'].includes('multipart'))return r.fulfill({json:{id}});
   const body=r.request().postDataJSON();record={id,version:(record?.version||0)+1,document:body.document,updated_at:'2026-10-21T15:00:00Z'};
   expect(record.document.customer.personId).toBe('42');
   expect(record.document.equipments[0].components[0].points[0].spectra.velocity).toEqual({name:'chart.png',assetId:id});
   return r.fulfill({json:record});
  }
  if(url.searchParams.has('image'))return r.fulfill({contentType:'image/png',body:Buffer.from(image,'base64')});
  if(url.searchParams.has('id'))return r.fulfill({json:record});
  return r.fulfill({json:{reports:record?[{...record,title:record.document.title,clients:'ITUTEX',service_order:'14948',updated_by:'Rafael'}]:[],hasMore:false}});
 });
 await page.goto('/tools/vibration-report.html');
 await expect(page.getByRole('tab',{name:'Relatórios salvos',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.locator('#vibrationEditor')).toBeHidden();
 await page.getByRole('button',{name:'Novo relatório',exact:true}).click();
 await expect(page.locator('#vibrationEditor')).toBeVisible();
 const project={title:'Relatório salvo',serviceOrder:'14948',equipments:[{machine:'Compressor',client:'ITUTEX',selected:true,components:[{name:'Motor',points:[{name:'01H',velocity:2,acceleration:'',peak:'',spectra:{velocity:{name:'chart.png',data:'data:image/png;base64,'+image}}}]}]}]};
 await page.locator('#openProject').setInputFiles({name:'project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
 await expect(page.locator('.spectrum-thumb')).toHaveCount(1);
 await page.getByRole('button',{name:'Salvar na base',exact:true}).click();
 await expect(page.locator('#storedSaveStatus')).toContainText('Selecione um cliente');
 await page.locator('#vCustomerSearch').fill('ITUTEX');
 await page.locator('#vCustomerResults').getByRole('button',{name:/ITUTEX/}).click();
 await page.getByRole('button',{name:'Salvar na base',exact:true}).click();
 await expect(page.locator('#storedSaveStatus')).toContainText('sucesso');
 await page.getByRole('tab',{name:'Relatórios salvos',exact:true}).click();
 await expect(page.locator('#storedReports')).toContainText('ITUTEX');
 await page.getByRole('button',{name:'Novo relatório',exact:true}).click();
 await expect(page.locator('.spectrum-thumb')).toHaveCount(0);
 await page.getByRole('tab',{name:'Relatórios salvos',exact:true}).click();
 await page.getByRole('button',{name:'Editar',exact:true}).click();
 await expect(page.locator('.spectrum-thumb')).toHaveCount(1);
 await expect(page.locator('#title')).toHaveValue('Relatório salvo');
 await expect(page.locator('#vCustomerSelected')).toContainText('ITUTEX');
 await page.locator('#title').fill('Relatório revisado');
 await page.getByRole('button',{name:'Salvar na base',exact:true}).click();
 await expect(page.locator('#storedCurrent')).toContainText('versão 2');
 await page.getByRole('tab',{name:'Relatórios salvos',exact:true}).click();
 const popup=page.waitForEvent('popup');await page.getByRole('button',{name:'Gerar PDF',exact:true}).click();const preview=await popup;
 await expect(preview.locator('.v-graphs img')).toHaveCount(1);
 await expect(preview.locator('.v-cover-header h2')).toHaveText('Relatório revisado');
});

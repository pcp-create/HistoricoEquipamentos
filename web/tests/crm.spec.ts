import {test,expect} from '@playwright/test';
const opportunityId='10000000-0000-4000-8000-000000000001',proposalId='20000000-0000-4000-8000-000000000001';
const draft={company:'1',type:'4',customer:'10',equipment:'',serviceType:'',origin:'',seller:'21',technician:'',payment:'',expected:'',delivery:'',situation:'',flowStatus:'',freight:'',notes:'',internalNotes:'',items:[],extra:{}};
const catalog={opportunityTypes:[{id:1,code:'MAN',name:'Manutenção',active:true,version:1}],proposalTypes:[{id:1,code:'MPA',name:'Preventiva Avulsa',opportunity_type_id:1,active:true,order_types:['4'],version:1}],orderTypes:[{id:'4',name:'Preventiva',active:true}]};
test('CRM saves proposals locally and only creates an ERP order when concretizing',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/**',r=>r.fulfill({json:{}}));
 const op:any={id:opportunityId,number:1,type_id:1,customer_id:10,customer_name:'Cliente Teste',company_id:1,title:'Manutenção do cliente',status:'open',notes:'',version:1,proposals:[],history:[]};
 let proposal:any={id:proposalId,number:1,opportunity_id:opportunityId,opportunity_number:1,type_id:1,opportunity_type_id:1,company_id:1,customer_name:'Cliente Teste',title:'Preventiva 2026',status:'pending',version:1,document:draft,names:{customer:'Cliente Teste',equipment:''},total_cents:0,links:[]};
 const writes:any[]=[];let directErpWrites=0;
 const quoteItem=(kind:string,code:string,name:string)=>({kind,key:kind+':'+code,code,name,unit:kind==='material'?'UN':'H',quantity:'1',price:'',selected:false,source:'Histórico do equipamento',referencePrice:'12',minimumPrice:'9',lastPrice:'10',referenceAt:'2026-01-01'});
 const historyQueries:URLSearchParams[]=[];
 await page.route('**/api/quotes*',r=>{const q=new URL(r.request().url()).searchParams;historyQueries.push(q);return r.fulfill({json:{items:[quoteItem('material','50','Filtro histórico'),quoteItem('service','60','Revisão histórica')],histories:{},warnings:[]}});});
 await page.route('**/api/service-orders*',r=>{
  if(r.request().method()==='POST'){directErpWrites++;return r.fulfill({status:500,json:{error:'Não deve enviar diretamente ao M8'}});}
  const p=new URL(r.request().url()).searchParams;
  return r.fulfill({json:p.get('lookup')==='metadata'?{types:[{id:'4',name:'Preventiva',equipment_required:false,customer_equipment_only:false}],registries:[],users:[]}:p.get('lookup')==='sellers'?{rows:[{id:'21',name:'Vendedor manual'}],defaultSellerId:'21'}:{rows:[{id:'10',name:'Cliente Teste'}]}});
 });
 await page.route('**/api/crm*',async r=>{
  const p=new URL(r.request().url()).searchParams;
  if(r.request().method()==='GET')return r.fulfill({json:p.has('catalogs')?catalog:p.has('overview')?{opportunities:1,proposals:1,orders:0,converted:0,conversion:0}:p.has('opportunity')?op:p.has('proposal')?proposal:{rows:[{...op,type_name:'Manutenção',proposal_count:1,order_count:0,updated_at:new Date().toISOString()}],total:1,page:1}});
  const b=r.request().postDataJSON();writes.push(b);
  if(b.action==='save-opportunity')return r.fulfill({json:op});
  if(b.action==='create-proposal')return r.fulfill({json:proposal});
  if(b.action==='save-proposal'){proposal={...proposal,title:b.title,status:b.status,version:proposal.version+1,document:b.draft,names:b.names};return r.fulfill({json:proposal});}
  if(b.action==='convert'){proposal={...proposal,status:'converting',version:proposal.version+1};return r.fulfill({json:{state:'ready',linkId:b.id}});}
  if(b.action==='advance'){proposal={...proposal,status:'won',version:proposal.version+1,links:[{id:b.id,order_id:900,company_id:1,state:'complete',actor:'planner',created_at:new Date().toISOString()}]};return r.fulfill({json:{state:'complete',m8Id:900,linkId:b.id}});}
  return r.fulfill({json:{}});
 });
 await page.goto('/crm');
 await expect(page.getByRole('heading',{name:'CRM',exact:true})).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Listas do CRM'}).getByRole('button')).toHaveCount(3);
 await page.screenshot({path:'/tmp/crm-dashboard-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'/tmp/crm-dashboard-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1080});
 await page.getByRole('button',{name:'OP-1 · Manutenção do cliente'}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Tipo de proposta *').selectOption('1');
 await dialog.getByLabel('Título da proposta *').fill('Preventiva 2026');
 await dialog.getByRole('button',{name:'Criar proposta',exact:true}).click();
 await expect(page).toHaveURL('/crm/propostas/'+proposalId);
 await expect(page.getByRole('heading',{name:'Proposta comercial PROP-1'})).toBeVisible();
 await expect(page.getByRole('combobox',{name:'Vendedor',exact:true})).toHaveValue(/Vendedor manual/);
 await page.getByRole('combobox',{name:'Tipo Ordem de Serviço',exact:true}).click();
 await page.locator('button[role=option]').filter({hasText:'Preventiva'}).click();
 await page.getByLabel('Observações',{exact:false}).first().fill('Proposta local');
 await expect(page.getByRole('button',{name:'Concretizar e gerar OS'})).toBeDisabled();
 await page.getByRole('button',{name:'Salvar proposta',exact:true}).click();
 await expect.poll(()=>writes.filter(w=>w.action==='save-proposal').length).toBe(1);
 expect(writes.some(w=>w.action==='convert')).toBe(false);expect(directErpWrites).toBe(0);
 await page.getByRole('button',{name:'Continuar para Produtos',exact:true}).click();
 const product=page.locator('.crm-quote-item').filter({has:page.getByRole('checkbox',{name:'Incluir Filtro histórico',exact:true})});
 await product.getByRole('checkbox').check();
 await product.getByRole('button',{name:/Usar venda M8/}).click();
 await product.getByRole('spinbutton',{name:'Quantidade',exact:true}).fill('2');
 await page.getByRole('button',{name:'Continuar para Serviços',exact:true}).click();
 const service=page.locator('.crm-quote-item').filter({has:page.getByRole('checkbox',{name:'Incluir Revisão histórica',exact:true})});
 await service.getByRole('checkbox').check();
 await service.getByRole('button',{name:/Usar venda M8/}).click();
 await service.getByLabel('Observação interna: Revisão histórica',{exact:true}).fill('Verificar orçamento');
 await page.getByRole('button',{name:'Salvar proposta',exact:true}).click();
 await expect.poll(()=>writes.filter(w=>w.action==='save-proposal').length).toBe(2);
 expect(writes.filter(w=>w.action==='save-proposal')[1].draft.items).toEqual(expect.arrayContaining([expect.objectContaining({kind:'material',code:'50',quantity:'2',price:'12.00'}),expect.objectContaining({kind:'service',code:'60',internalNotes:'Verificar orçamento'})]));
 expect(historyQueries.some(q=>q.get('clientId')==='10'&&q.get('historyScope')==='customer')).toBe(true);
 await expect(page.getByRole('button',{name:'Concretizar e gerar OS'})).toBeEnabled();
 page.on('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Concretizar e gerar OS'}).click();
 await expect(page.getByRole('link',{name:'OS-900',exact:true})).toBeVisible();
 expect(writes.filter(w=>w.action==='convert')).toHaveLength(1);expect(writes.filter(w=>w.action==='advance')).toHaveLength(1);expect(directErpWrites).toBe(0);
 await expect(page.getByRole('button',{name:'Salvar proposta',exact:true})).toBeEnabled();
 await page.getByLabel('Observações',{exact:false}).first().fill('Ajuste local após concretização');
 await page.getByRole('button',{name:'Salvar proposta',exact:true}).click();
 await expect.poll(()=>writes.filter(w=>w.action==='save-proposal').length).toBe(3);
 await expect(page.getByRole('link',{name:'OS-900',exact:true})).toBeVisible();
 expect(writes.filter(w=>w.action==='convert')).toHaveLength(1);
});


test('CRM registries allow manually mapping proposal types to ERP order type IDs',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/**',r=>r.fulfill({json:{}}));
 let saved:any;
 await page.route('**/api/crm*',r=>{if(r.request().method()==='POST'){saved=r.request().postDataJSON();return r.fulfill({json:{id:1}});}return r.fulfill({json:catalog});});
 await page.goto('/configuracoes/cadastros/crm');
 await page.getByRole('button',{name:'Tipos de Proposta',exact:true}).click();
 await page.getByRole('button',{name:'Editar Preventiva Avulsa',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Tipo de proposta',exact:true});
 await dialog.getByLabel('IDs Tipos de Ordem de Serviço M8',{exact:true}).fill('4, 99');
 await dialog.getByRole('button',{name:'Salvar cadastro',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 expect(saved).toMatchObject({action:'save-catalog',kind:'proposal',opportunityTypeId:'1',orderTypes:['4','99']});
});

import {test,expect} from '@playwright/test';
test.setTimeout(90000);
test('customer manager filters signals, shows scheduling and only released report links',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.route('**/api/tasks*',r=>r.fulfill({json:{tasks:[],users:[],settings:{},canManage:false}}));
 const machines=[{id:'1',name:'Compressor principal',brand:'Atlas Copco',model:'GA 75',serial:'A123',plans:1,nextDue:'2026-11-12',signal:{key:'ok',label:'Em dia',reason:'Sem pendências identificadas.'},openOrders:[],operations:[{id:'done',description:'Revisão preventiva 8.000 h',date:'2026-09-12',status:'reviewed',order_number:'14979',report:true},{id:'pending',description:'Inspeção técnica',date:'2026-11-12',time:'08:00',status:'scheduled',order_number:'15119',report:false}]},{id:'2',name:'Compressor reserva',model:'GA 22',brand:'Atlas Copco',serial:'B234',signal:{key:'critical',label:'Manutenção vencida',reason:'Limite de utilização atingido.'},nextDue:'2026-10-10',openOrders:[{number:'15120'}],operations:[]},{id:'3',name:'Secador de ar',model:'FX',serial:'C345',signal:{key:'unknown',label:'Dados a completar',reason:'Sem previsão suficiente.'},openOrders:[],operations:[]}];
 await page.route('**/api/customer-fleet*',r=>r.fulfill({json:r.request().url().includes('?')?{customer:{name:'Indústria Exemplo'},updatedAt:'2026-10-23T12:00:00Z',machines}:{clients:[{id:'10',name:'Indústria Exemplo',machines:3}]}}));
 await page.goto('/equipamentos/clientes');await expect(page.getByRole('heading',{name:'Indústria Exemplo'})).toBeVisible();
 await expect(page.locator('.fleet-machine')).toHaveCount(3);
 await page.getByRole('navigation',{name:'Situação das máquinas'}).getByRole('button',{name:/Manutenção vencida/}).click();await expect(page.locator('.fleet-machine')).toHaveCount(1);
 await page.getByRole('button',{name:/Todas as máquinas/}).click();
 const card=page.locator('.fleet-machine').filter({has:page.getByRole('heading',{name:'Compressor principal',exact:true})});await card.getByRole('button',{name:'Programações e manutenções'}).click();await expect(card.getByRole('link',{name:'Relatório de manutenção (PDF)'})).toHaveAttribute('href','/api/service-scheduling/checklist-pdf?mode=summary&operationId=done');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:'/tmp/customer-fleet-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1080});await page.screenshot({path:'/tmp/customer-fleet-desktop.png',fullPage:true});
});

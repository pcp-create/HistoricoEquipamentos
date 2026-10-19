import {test,expect} from '@playwright/test';
test('additional technician can record work but cannot open report or finish operation',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 const row={can_report:false,id:'op1',schedule_id:1,number:14849,position:1,description:'Inspeção',status:'awaiting_execution',customer:'Cliente de teste'};
 const detail={operation:{...row,document:{responsible:'tech',support:['helper'],checklistId:'ccp'}},email:'helper',checked:true,infoRead:true,finishPending:[],settings:{document:{checklists:[],vehicles:[],pauseReasons:[]}},detail:{order:{},equipment_links:[]},materials:{complete:true,items:[]},history:[]};
 await page.route('**/api/activity',r=>r.fulfill({json:{}}));
 await page.route('**/api/field*',r=>r.fulfill({json:r.request().url().includes('?')?detail:{email:'helper',displayName:'Adicional',rows:[row],active:null}}));
 await page.goto('/tecnico');
 await page.getByRole('button',{name:/Programação/}).click();
 await page.getByText('OS 14849',{exact:true}).click();
 await expect(page.getByRole('button',{name:'Gerar Relatório OS',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:/OP01/}).click();
 await expect(page.getByRole('button',{name:'Relatório',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Finalizar Operação',exact:true})).toBeDisabled();
 for(const name of ['Informações','Peças','Iniciar atividade','Iniciar deslocamento','Apontamentos'])
   await expect(page.getByRole('button',{name,exact:true})).toBeEnabled();
});

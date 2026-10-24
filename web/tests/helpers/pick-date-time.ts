import type {Page} from '@playwright/test';
export async function pickDateTime(page:Page,label:string,value:string){
 const icon=page.getByRole('button',{name:`Abrir ${value.includes('-')?'calendário':'horário'}: ${label}`,exact:true});
 if(await icon.count())await icon.click();else await page.getByRole('textbox',{name:label,exact:true}).click();
 const dialog=page.getByRole('dialog',{name:label,exact:true});
 if(!value){await dialog.getByRole('button',{name:'Limpar',exact:true}).click();return;}
 const date=value.includes('-')?value.split('T')[0]:'';
 const time=value.includes('T')?value.split('T')[1]:date?'':value;
 if(date){
  const [year,month]=date.split('-').map(Number);
  const months=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  for(let i=0;i<120;i++){
   const current=(await dialog.locator('nav strong').innerText()).toLowerCase();
   const currentYear=Number(current.match(/\d{4}/)![0]);
   const currentMonth=months.findIndex(m=>current.includes(m))+1;
   const diff=(year-currentYear)*12+month-currentMonth;
   if(!diff)break;
   await dialog.getByRole('button',{name:diff>0?'Próximo mês':'Mês anterior',exact:true}).click();
  }
  await dialog.getByRole('button',{name:date.split('-').reverse().join('/'),exact:true}).click();
 }
 if(time){await dialog.getByRole('textbox',{name:'Hora',exact:true}).fill(time.slice(0,2));await dialog.getByRole('textbox',{name:'Minutos',exact:true}).fill(time.slice(3,5));}
 await dialog.getByRole('button',{name:'Confirmar',exact:true}).click();
}

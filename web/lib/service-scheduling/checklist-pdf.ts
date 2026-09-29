import 'server-only';
import {PDFDocument,StandardFonts,rgb,type PDFPage} from 'pdf-lib';
import {database} from '../db';
import {Forbidden} from '../auth';
import {checklistReport} from './checklist-report';
export async function checklistPdf(operationId:string,email:string){
 if(!/^[0-9a-f-]{36}$/i.test(operationId))return null;
 const db=database();
 const row=(await db.query(`SELECT p.document,p.position,s.order_id,o.numero_sequencia,o.cliente_nome,o.equipamento,u.role,u.enabled FROM web_service_operations p JOIN web_service_schedules s ON s.id=p.schedule_id LEFT JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id JOIN web_user_access u ON u.email=$2 WHERE p.id=$1`,[operationId,email])).rows[0];
 if(!row?.enabled||(row.role!=='admin'&&row.document.responsible!==email&&!row.document.support?.includes(email)))throw new Forbidden();
 const run=row.document.checklistRun;if(!run)return null;
 const report=checklistReport(run);const ids=[...new Set(report.flatMap(s=>s.groups.flatMap(g=>g.fields.flatMap(f=>f.photos))))];
 const photos=ids.length?(await db.query('SELECT id::text,content FROM web_service_checklist_photos WHERE operation_id=$1 AND id=ANY($2::bigint[])',[operationId,ids])).rows:[];
 return {bytes:await renderChecklistPdf({title:[run.template.prefix,run.template.name].filter(Boolean).join(' — '),order:String(row.numero_sequencia||row.order_id),client:row.cliente_nome||'',equipment:row.equipamento||'',position:row.position,report,photos}),filename:`Checklist-OS-${row.numero_sequencia||row.order_id}.pdf`};
}
export async function renderChecklistPdf(data:{title:string;order:string;client:string;equipment:string;position:number;report:ReturnType<typeof checklistReport>;photos:any[]}){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 let page!:PDFPage,y=0;
 const clean=(s:string)=>Array.from(s).map(c=>{try{font.encodeText(c);return c;}catch{return '?';}}).join('');
 function newPage(){page=pdf.addPage([595.28,841.89]);y=798;page.drawText('RJ Compressores · Relatório de checklist',{x:38,y,size:10,font:bold,color:rgb(.2,.25,.3)});y-=28;}
 function room(h:number){if(y-h<45)newPage();}
 function text(value:string,size=10,strong=false){const f=strong?bold:font;
  for(const paragraph of String(value).split(/\r?\n/)){let line='';const lines:string[]=[];
   for(const word of clean(paragraph).split(' ')){if(line&&f.widthOfTextAtSize(line+' '+word,size)>519){lines.push(line);line='';}for(const c of (line?' ':'')+word){if(f.widthOfTextAtSize(line+c,size)>519){lines.push(line);line='';}line+=c;}}
   lines.push(line);for(const line of lines){room(size+5);page.drawText(line,{x:38,y,size,font:f,color:rgb(.17,.22,.27)});y-=size+5;}
  }
 }
 newPage();text(data.title,14,true);text(`OS ${data.order} · Operação ${data.position}`,10,true);text(data.client);text(data.equipment);text('Exportação das respostas salvas. Etapas não devolvidas são rascunhos.',8);y-=10;
 for(const stage of data.report){room(55);text(stage.name+' · '+(stage.status==='submitted'?'Devolvida':'Rascunho'),12,true);
  for(const group of stage.groups){room(40);if(group.name)text(group.name,10,true);
   for(const field of group.fields){room(35);text(field.label,10,true);
    if(field.value!==null)text(typeof field.value==='number'?field.value.toLocaleString('pt-BR'):String(field.value));
    else if(!field.photos.length)text('Não preenchido',9);
    if(field.comment)text('Comentário: '+field.comment,9);
    for(const id of field.photos){const image=data.photos.find(p=>p.id===id);if(!image)continue;const embedded=await pdf.embedJpg(image.content);const dimensions=embedded.scaleToFit(field.type==='signature'?300:360,field.type==='signature'?95:220);room(dimensions.height+12);page.drawImage(embedded,{x:38,y:y-dimensions.height,width:dimensions.width,height:dimensions.height});y-=dimensions.height+12;}
    y-=7;
   }
  }
 }
 const pages=pdf.getPages();pages.forEach((p,i)=>p.drawText(`${i+1} / ${pages.length}`,{x:520,y:24,size:8,font}));
 return pdf.save();
}

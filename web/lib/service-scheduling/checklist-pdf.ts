import { operationNumber } from "./operation-number";
import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { technicalReport } from './technical-report';
import fontkit from '@pdf-lib/fontkit';
import sharp from 'sharp';
import {PDFDocument,rgb,pushGraphicsState,popGraphicsState,moveTo,lineTo,appendBezierCurve,closePath,clip,endPath,type PDFPage} from 'pdf-lib';
import {database} from '../db';
import {Forbidden} from '../auth';
import {checklistReport,reportFieldValue,type ReportMode} from './checklist-report';
export class ChecklistPdfPending extends Error {}
export async function checklistPdf(operationId:string,email:string,mode:ReportMode="complete"){
 if(!/^[0-9a-f-]{36}$/i.test(operationId))return null;
 const db=database();
 const row=(await db.query(`SELECT p.document,p.status,p.position,to_jsonb(o) AS order_record,s.order_id,o.numero_sequencia,o.cliente_nome,o.equipamento,u.role,u.enabled FROM web_service_operations p JOIN web_service_schedules s ON s.id=p.schedule_id LEFT JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id JOIN web_user_access u ON u.email=$2 WHERE p.id=$1`,[operationId,email])).rows[0];
 if(!row?.enabled||(row.role!=='admin'&&row.document.responsible!==email&&!row.document.support?.includes(email)))throw new Forbidden();
 if(!['reviewed','completed'].includes(row.status))throw new ChecklistPdfPending('Conclua a revisão da operação antes de gerar o PDF.');
 if(mode==='budget'&&row.role!=='admin')throw new Forbidden();
 const run=row.document.checklistRun;if(!run)return null;
 const [sessions,events,operationEvents,users]=await Promise.all([
  db.query('SELECT f.*,u.display_name FROM web_field_sessions f LEFT JOIN web_user_access u ON u.email=f.actor WHERE f.operation_id=$1',[operationId]),
  db.query("SELECT * FROM web_field_events WHERE operation_id=$1 AND action IN ('start_work','start_travel','pause','resume','stop') ORDER BY created_at,id",[operationId]),
  db.query('SELECT e.*,u.display_name FROM web_service_operation_events e LEFT JOIN web_user_access u ON u.email=e.actor WHERE e.operation_id=$1',[operationId]),
  db.query('SELECT email,display_name FROM web_user_access WHERE email=$1',[row.document.responsible]),
 ]);
 const report=technicalReport({id:operationId,document:row.document},row.order_record||{},users.rows,sessions.rows,events.rows,operationEvents.rows,mode);
 const ids=[...new Set(report.flatMap(s=>s.groups.flatMap(g=>g.fields.flatMap(f=>f.photos))))];
 const photos=ids.length?(await db.query('SELECT id::text,content FROM web_service_checklist_photos WHERE operation_id=$1 AND id=ANY($2::bigint[])',[operationId,ids])).rows:[];
 return {bytes:await renderChecklistPdf({title:run.template.name,order:String(row.numero_sequencia||row.order_id),client:row.cliente_nome||'',equipment:row.equipamento||'',position:row.position,report,photos,mode}),filename:`Checklist-OS-${row.numero_sequencia||row.order_id}-${mode}.pdf`};
}
export async function renderChecklistPdf(data:{title:string;order:string;client:string;equipment:string;position:number;report:ReturnType<typeof checklistReport>;photos:any[];mode?:ReportMode}){
 const pdf=await PDFDocument.create();
 pdf.registerFontkit(fontkit);
 const [regularBytes,boldBytes,titleBytes,labelBytes]=await Promise.all(['dm-sans-latin-400-normal.woff','dm-sans-latin-700-normal.woff','manrope-latin-800-normal.woff','dm-sans-latin-600-normal.woff'].map(file=>readFile(path.join(process.cwd(),'public/fonts/report',file))));
 const font=await pdf.embedFont(regularBytes,{subset:true}),bold=await pdf.embedFont(boldBytes,{subset:true}),titleFont=await pdf.embedFont(titleBytes,{subset:true}),labelFont=await pdf.embedFont(labelBytes,{subset:true});
 const logo=await pdf.embedPng(await readFile(path.join(process.cwd(),'public/logo-rj.png')));
 const left=9,width=595.28-2*left,labelWidth=width*.38,valueX=left+labelWidth,valueWidth=width-labelWidth;
 // PDF points: 2 CSS pixels correspond to 1.5 points.
 const bodySize=7.5,stageSize=8.5;
 const pageHeight=841.89,headerHeight=60,bodyTop=pageHeight-headerHeight-14;
 const ink=rgb(39/255,68/255,95/255),lineColor=rgb(220/255,229/255,238/255);
 let page!:PDFPage,y=0;
 const clean=(value:string)=>Array.from(value).map(c=>{if(c==='\n'||c==='\r')return c;try{font.encodeText(c);return c;}catch{return '?';}}).join('');
 function wrap(value:string,limit:number,size=bodySize,strong=false,face=strong?bold:font){
  const lines:string[]=[];
  for(const paragraph of clean(String(value)).split(/\r?\n/)){
   let line='';
   for(const word of paragraph.split(' ')){
    if(line&&face.widthOfTextAtSize(line+' '+word,size)>limit){lines.push(line);line='';}
    for(const char of (line?' ':'')+word){if(face.widthOfTextAtSize(line+char,size)>limit){lines.push(line);line='';}line+=char;}
   }
   lines.push(line);
  }
  return lines;
 }
 const gradients=await Promise.all([['#073453','#0c426a'],['#dceafa','#eef5fc']].map(async colors=>pdf.embedPng(await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="2"><defs><linearGradient id="g"><stop stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs><path fill="url(#g)" d="M0 0H1200V2H0Z"/></svg>`)).png().toBuffer())));
 function gradient(x:number,top:number,w:number,h:number,kind:0|1){
  page.drawImage(gradients[kind],{x,y:top-h,width:w,height:h});
 }
 function newPage(){
  page=pdf.addPage([595.28,pageHeight]);
  gradient(0,pageHeight,595.28,headerHeight,0);
  const dimensions=logo.scaleToFit(88,46);
  page.drawImage(logo,{x:16,y:pageHeight-headerHeight+(headerHeight-dimensions.height)/2,width:dimensions.width,height:dimensions.height});
  page.drawLine({start:{x:110,y:793},end:{x:110,y:831},thickness:.6,color:rgb(.65,.78,.9)});
  const reportTitle=data.mode==='budget'?'RELATÓRIO DE ORÇAMENTO':'RELATÓRIO TÉCNICO';
  const titleSize=Math.min(15,345/titleFont.widthOfTextAtSize(reportTitle,1));
  const subtitles=wrap(data.title.toLocaleUpperCase("pt-BR"),345,7).slice(0,2);
  const titleHeight=titleFont.heightAtSize(titleSize,{descender:false}),subtitleHeight=font.heightAtSize(7,{descender:false});
  const blockHeight=titleHeight+7+subtitleHeight+(subtitles.length-1)*10;
  const titleBaseline=pageHeight-headerHeight/2+blockHeight/2-titleHeight;
  page.drawText(reportTitle,{x:124,y:titleBaseline,size:titleSize,font:titleFont,color:rgb(1,1,1)});
  subtitles.forEach((line,index)=>page.drawText(line,{x:124,y:titleBaseline-7-subtitleHeight-index*10,size:7,font,color:rgb(.85,.92,1)}));
  page.drawLine({start:{x:490,y:793},end:{x:490,y:831},thickness:.6,color:rgb(.65,.78,.9)});
  page.drawText('OS Nº',{x:502,y:823,size:8,font,color:rgb(1,1,1)});
  const identifier=clean(`${data.order}/${operationNumber(data.position)}`);
  const identifierSize=Math.min(15,77/Math.max(1,bold.widthOfTextAtSize(identifier,1)));
  page.drawText(identifier,{x:502,y:802,size:identifierSize,font:bold,color:rgb(1,1,1)});
  y=bodyTop;
 }
 function room(height:number){if(y-height<45)newPage();}
 function text(value:string,size=bodySize,strong=false){for(const line of wrap(value,width,size,strong)){room(size+6);page.drawText(line,{x:left,y,size,font:strong?bold:font,color:ink});y-=size+6;}}
 let sectionNumber=0,blockPage=0,blockTop=0;
 function heading(value:string,stage=false){
  const size=stage?stageSize:bodySize;
  if(stage)sectionNumber++;
  const title=stage?value.replace(/^\s*\d+[.\-–]?\s*/, '').toLocaleUpperCase('pt-BR'):value;
  const lines=wrap(title,width-(stage?46:20),size,true),height=lines.length*12+9;
  room(height+35);
  if(stage){
   blockPage=pdf.getPageCount()-1;blockTop=y+5;
   // Clip the header fill itself so no square edge remains behind the rounded outline.
   const top=y+5,bottom=top-height,right=left+width;
   page.pushOperators(pushGraphicsState(),moveTo(left+5,top),lineTo(right-5,top),
    appendBezierCurve(right-5/3,top,right,top-5/3,right,top-5),
    lineTo(right,bottom),lineTo(left,bottom),lineTo(left,top-5),
    appendBezierCurve(left,top-5/3,left+5/3,top,left+5,top),closePath(),clip(),endPath());
   gradient(left,top,width,height,1);
   page.drawSvgPath(`M 5 0 H 28 V ${height} H 0 V 5 Q 0 0 5 0 Z`,{x:left,y:y+5,color:rgb(7/255,87/255,136/255)});
   page.drawText(String(sectionNumber).padStart(2,'0'),{x:left+14-bold.widthOfTextAtSize(String(sectionNumber).padStart(2,'0'),bodySize)/2,y:y+5-height/2-bold.heightAtSize(bodySize,{descender:false})/2,size:bodySize,font:bold,color:rgb(1,1,1)});
   page.pushOperators(popGraphicsState());
  }else page.drawRectangle({x:left,y:y-height+5,width,height,color:rgb(.97,.98,.99),borderColor:lineColor,borderWidth:.5});
  const textHeight=bold.heightAtSize(size,{descender:false});
  const baseline=y+5-height/2+((lines.length-1)*12+textHeight)/2-textHeight;
  lines.forEach((line,index)=>page.drawText(line,{x:left+(stage?37:9),y:baseline-index*12,size,font:bold,color:ink}));y-=height;
 }
 function row(label:string,value:string,choices?:string[],selected?:any){
  const labels=wrap(label,labelWidth-16,bodySize,false,labelFont), values=choices ? [] : wrap(value,valueWidth-16,bodySize);
  const choiceLines:{label:string;selected:boolean;x:number}[][]=[];
  if(choices){
   let x=0;let line:typeof choiceLines[number]=[];
   for(const option of choices){
    const lines=wrap(option,valueWidth-32,bodySize);
    const needed=font.widthOfTextAtSize(clean(lines[0]),bodySize)+26;
    if(line.length&&x+needed>valueWidth-16){choiceLines.push(line);line=[];x=0;}
    lines.forEach((part,i)=>{
     if(i){choiceLines.push(line);line=[];x=0;}
     line.push({label:part,selected:option===selected,x});x+=font.widthOfTextAtSize(clean(part),bodySize)+26;
    });
   }
   if(line.length)choiceLines.push(line);
  }
  let offset=0;const length=Math.max(labels.length,values.length,choiceLines.length);
  while(offset<length){
   room(23);const count=Math.min(length-offset,Math.max(1,Math.floor((y-55)/12))),height=count*12+9,top=y+5,bottom=top-height;
   page.drawRectangle({x:left,y:bottom,width:labelWidth,height,color:rgb(237/255,243/255,250/255)});
   page.drawLine({start:{x:left,y:top},end:{x:left+width,y:top},thickness:.5,color:lineColor});
   for(let i=0;i<count;i++){
    const baseline=y-8-i*12;
    if(labels[offset+i])page.drawText(labels[offset+i],{x:left+8,y:baseline,size:bodySize,font:labelFont,color:ink});
    if(values[offset+i])page.drawText(values[offset+i],{x:valueX+8,y:baseline,size:bodySize,font,color:ink});
    for(const option of choiceLines[offset+i]||[]){
     const x=valueX+8+option.x;
     page.drawSvgPath('M 2 0 H 6 Q 8 0 8 2 V 6 Q 8 8 6 8 H 2 Q 0 8 0 6 V 2 Q 0 0 2 0 Z',{x,y:baseline+7,borderColor:option.selected?rgb(.22,.48,.85):rgb(.65,.7,.75),borderWidth:.6,...(option.selected?{color:rgb(.22,.48,.85)}:{})});
     if(option.selected){
      page.drawLine({start:{x:x+1.5,y:baseline+3},end:{x:x+3.3,y:baseline+1},thickness:1,color:rgb(1,1,1)});
      page.drawLine({start:{x:x+3.3,y:baseline+1},end:{x:x+6.7,y:baseline+5.5},thickness:1,color:rgb(1,1,1)});
     }
     page.drawText(clean(option.label),{x:x+12,y:baseline,size:bodySize,font,color:ink});
    }
   }
   page.drawLine({start:{x:valueX,y:top},end:{x:valueX,y:bottom},thickness:.5,color:lineColor});
   y=bottom-5;offset+=count;if(offset<length)newPage();
  }
 }
 function timeRow(cells:string[],header=false){
  const widths=[width*.28,width*.36,width*.36];
  const lines=cells.map((cell,index)=>wrap(cell,widths[index]-16,bodySize,false,header?bold:index===0?labelFont:font));
  let offset=0;const length=Math.max(...lines.map(column=>column.length));
  while(offset<length){
   room(23);
   const count=Math.min(length-offset,Math.max(1,Math.floor((y-55)/12))),height=count*12+9,top=y+5,bottom=top-height;
   page.drawRectangle({x:left,y:bottom,width:header?width:widths[0],height,color:header?rgb(.96,.97,.98):rgb(237/255,243/255,250/255)});
   page.drawLine({start:{x:left,y:top},end:{x:left+width,y:top},thickness:.5,color:lineColor});
   let x=left;
   lines.forEach((column,index)=>{
    if(index)page.drawLine({start:{x,y:top},end:{x,y:bottom},thickness:.5,color:lineColor});
    for(let i=0;i<count;i++)if(column[offset+i])page.drawText(column[offset+i],{x:x+8,y:y-8-i*12,size:bodySize,font:header?bold:index===0?labelFont:font,color:ink});
    x+=widths[index];
   });
   y=bottom-5;offset+=count;if(offset<length)newPage();
  }
 }

 newPage();
 for(const stage of data.report){
  heading(stage.name,true);
  for(const group of stage.groups){
   if(group.name)heading(group.name);
   if(stage.id==='events'&&!group.name){
    room(46);timeRow(['Data e hora','Apontamento','Responsável'],true);
    for(const field of group.fields)timeRow([field.label,reportFieldValue(field),field.responsible||'—']);
    continue;
   }
   for(const field of group.fields){
    row(field.label,reportFieldValue(field)+(field.comment&&!field.options?'\nComentário: '+field.comment:''),field.options,field.value);
    if(field.options&&field.comment)row('Comentário',field.comment);
    for(const id of field.photos){
     const image=data.photos.find(p=>String(p.id)===String(id));if(!image)continue;
     const bytes=new Uint8Array(image.content);
     const embedded=bytes[0]===137?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);
     const dimensions=embedded.scaleToFit(Math.min(valueWidth-16,230),field.type==='signature'?70:145);
     const height=dimensions.height+12;room(height);
     page.drawRectangle({x:left,y:y-height+5,width:labelWidth,height,color:rgb(237/255,243/255,250/255)});
     page.drawImage(embedded,{x:valueX+10,y:y-dimensions.height-5,width:dimensions.width,height:dimensions.height});
     page.drawLine({start:{x:valueX,y:y+5},end:{x:valueX,y:y-height+5},thickness:.5,color:lineColor});
     y-=height;
    }
   }
  }
  for(let index=blockPage;index<pdf.getPageCount();index++){
   const top=index===blockPage?blockTop:bodyTop+5,bottom=index===pdf.getPageCount()-1?y+5:45,h=top-bottom;
   // Mask the fill outside rounded corners; the outer contour is drawn only once.
   const targetPage=pdf.getPages()[index];
   targetPage.drawSvgPath(`M 0 ${h-5} Q 0 ${h} 5 ${h} H 0 Z M ${width-5} ${h} Q ${width} ${h} ${width} ${h-5} V ${h} Z`,{x:left,y:top,color:rgb(1,1,1)});
   targetPage.drawSvgPath(`M 5 0 H ${width-5} Q ${width} 0 ${width} 5 V ${h-5} Q ${width} ${h} ${width-5} ${h} H 5 Q 0 ${h} 0 ${h-5} V 5 Q 0 0 5 0 Z`,{x:left,y:top,borderColor:lineColor,borderWidth:.5});
  }
  y-=9;
 }
 const pages=pdf.getPages();pages.forEach((p,i)=>{
  p.drawLine({start:{x:left,y:35},end:{x:left+width,y:35},thickness:.7,color:ink});
  p.drawText('RJ Compressores',{x:left,y:22,size:8,font:bold,color:ink});
  p.drawText('Relatório técnico · Gestão Integrada',{x:218,y:22,size:7,font,color:ink});
  p.drawText(`Página ${i+1} de ${pages.length}`,{x:495,y:22,size:7,font,color:ink});
 });
 return pdf.save();
}

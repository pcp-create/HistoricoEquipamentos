import 'server-only';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {PDFDocument,StandardFonts,rgb,type PDFFont,type PDFPage} from 'pdf-lib';
import {monthBounds} from './model';
import {addReportFooter} from '../reports/pdf-footer';

const navy=rgb(12/255,61/255,93/255),blue=rgb(36/255,97/255,148/255),muted=rgb(.39,.49,.58),pale=rgb(.94,.97,.99),line=rgb(.85,.90,.94);
const moneyHours=(n:number)=>n.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' h';
const percent=(planned:number,logged:number)=>logged>0?Math.round(planned/logged*100)+'%':'—';
function safe(value:unknown,font:PDFFont){return Array.from(String(value??'').replace(/[\r\n\t]+/g,' ')).map(ch=>{try{font.encodeText(ch);return ch}catch{return '?'}}).join('');}
function wrap(value:string,font:PDFFont,size:number,width:number){
 const words=safe(value,font).split(/\s+/).filter(Boolean),out:string[]=[];let line='';
 for(let word of words){while(font.widthOfTextAtSize(word,size)>width&&word.length>1){let n=word.length-1;while(n>1&&font.widthOfTextAtSize(word.slice(0,n),size)>width)n--;if(line){out.push(line);line='';}out.push(word.slice(0,n));word=word.slice(n);}const next=line?line+' '+word:word;if(font.widthOfTextAtSize(next,size)>width&&line){out.push(line);line=word;}else line=next;}
 if(line)out.push(line);return out.length?out:[''];
}
export async function productivityPdf(data:any){
 monthBounds(data.month);const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const systemLogo=await pdf.embedPng(await readFile(path.join(process.cwd(),'public/logo-rj.png')));
 const W=595.28,H=841.89,M=36,usable=W-2*M;let page!:PDFPage;let y=0,activeUser='';
 const month=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(data.month+'-01T12:00:00Z'));
 const draw=(value:string,x:number,at:number,size=9,face=font,color=navy)=>page.drawText(safe(value,face),{x,y:at,size,font:face,color});
 const startPage=()=>{page=pdf.addPage([W,H]);page.drawRectangle({x:0,y:H-82,width:W,height:82,color:navy});const logoSize=systemLogo.scaleToFit(82,58);page.drawImage(systemLogo,{x:M+(82-logoSize.width)/2,y:H-41-logoSize.height/2,...logoSize});page.drawLine({start:{x:M+94,y:H-67},end:{x:M+94,y:H-15},thickness:.6,color:rgb(.61,.72,.79)});draw('Apontamentos e produtividade',M+108,H-34,15,bold,rgb(1,1,1));draw(month.toLocaleUpperCase('pt-BR'),M+108,H-53,9,font,rgb(.8,.88,.95));y=H-101;if(activeUser){draw('Continuação · '+activeUser,M,y,10,bold,blue);y-=24;}};
 const need=(height:number)=>{if(y-height<70)startPage();};
 startPage();
 if(!data.users.length){draw('Nenhum técnico encontrado para os filtros selecionados.',M,y,10);y-=24;}
 for(const user of data.users){
  activeUser='';
  const days=Object.entries(user.days||{}).sort(([a],[b])=>a.localeCompare(b)) as [string,any][];
  const totals=days.reduce((a,[,d])=>({planned:a.planned+Number(d.planned||0),logged:a.logged+Number(d.logged||0)}),{planned:0,logged:0});
  need(96);page.drawRectangle({x:M,y:y-32,width:usable,height:32,color:pale});draw(user.name,M+10,y-21,12,bold);y-=47;activeUser=user.name;
  const metrics=[['PROGRAMADAS',moneyHours(totals.planned)],['APONTADAS',moneyHours(totals.logged)],['PRODUTIVIDADE',percent(totals.planned,totals.logged)]];
  metrics.forEach(([label,value],i)=>{const x=M+i*(usable/3);draw(label,x,y,8,bold,muted);draw(value,x,y-17,12,bold,blue)});y-=32;
  if(!days.length){draw('Sem apontamentos ou programação neste mês.',M,y-8,9,font,muted);y-=30;continue;}
  for(const [date,cell] of days){
   need(62);page.drawLine({start:{x:M,y:y+3},end:{x:W-M,y:y+3},thickness:.5,color:line});
   const weekday=new Intl.DateTimeFormat('pt-BR',{weekday:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')).replace(/\.$/,'');
   draw(date.split('-').reverse().join('/')+' · '+weekday,M,y-12,9,bold);draw('Programadas: '+moneyHours(cell.planned),M+95,y-12,9);draw('Apontadas: '+moneyHours(cell.logged),M+222,y-12,9);draw('Prod.: '+percent(cell.planned,cell.logged),M+390,y-12,9,bold,blue);y-=25;
   const grouped=new Map<string,{detail:any;planned:number;logged:number}>();
   for(const detail of cell.details||[]){const key=[detail.company,detail.order,detail.operation].join(':');const group=grouped.get(key)||{detail,planned:0,logged:0};if(detail.kind==='planned')group.planned+=Number(detail.hours||0);else group.logged+=Number(detail.hours||0);grouped.set(key,group);}
   for(const {detail,planned,logged} of grouped.values()){
    const head=`OS-${detail.order} / Operação ${String(detail.operation).padStart(2,'0')} · Programadas: ${moneyHours(planned)} · Apontadas: ${moneyHours(logged)}`;
    const content=[...wrap(head,bold,9,usable-16),...wrap(`${detail.customer||'Cliente não informado'} · ${detail.equipment||'Sem equipamento informado'}`,font,8,usable-16)];
    need(content.length*12+8);content.forEach((text,i)=>{draw(text,M+8,y,i===0?9:8,i===0?bold:font,i===0?navy:muted);y-=12});y-=5;
   }
   y-=5;
  }
  y-=12;
 }
 for(const p of pdf.getPages())p.drawText(safe('Produtividade = horas programadas ÷ horas apontadas × 100. Horas apontadas incluem pausas.',font),{x:M,y:48,size:7,font,color:muted});
 await addReportFooter(pdf,'Apontamentos e produtividade · Gestão Integrada',M);
 return pdf.save();
}

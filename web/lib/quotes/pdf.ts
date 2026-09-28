import {PDFDocument,StandardFonts,rgb,type PDFPage} from 'pdf-lib';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {quoteTotals,lineAmount,QuoteValidation,type Quote} from './types';
import {deliveryDeadline} from './delivery';
import {companyName} from '../company-names';
export const proposalNumber=(number:string)=>/^\d+$/.test(number)?`ORÇ-${number.padStart(5,'0')}`:number;
export async function quotePdf(quote:Quote & {number:string;created_at?:string},customer:Record<string,any>={}) {
 const totals=quoteTotals(quote.items);
 if(totals.invalid)throw new QuoteValidation('Preencha quantidade e preço dos itens selecionados antes de gerar o PDF.');
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const logo=await pdf.embedPng(await readFile(path.join(process.cwd(),'public/logo-rj.png')));
 const W=841.89,H=595.28,margin=24,width=W-48,navy=rgb(.06,.18,.30),blue=rgb(.13,.33,.55),gray=rgb(.46,.51,.57),line=rgb(.82,.87,.93);
 const number=proposalNumber(quote.number),date=quote.created_at?new Date(quote.created_at).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'';
 const money=(n:number)=>'R$ '+(n/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 const clean=(s:any)=>Array.from(String(s??'').replace(/\t/g,' ')).map(c=>{if(c==='\n')return c;try{font.encodeText(c);return c;}catch{return '?';}}).join('');
 function wrap(s:any,w:number,size=8){const result:string[]=[];for(const paragraph of clean(s).split('\n')){let current='';for(const c of paragraph){if(font.widthOfTextAtSize(current+c,size)>w){const split=current.lastIndexOf(' ');if(split>0){result.push(current.slice(0,split));current=current.slice(split+1);}else{result.push(current);current='';}}current+=c;}result.push(current);}return result;}
 let page!:PDFPage; let y=0;
 const text=(s:any,x:number,top:number,size=8,strong=false,color=navy)=>page.drawText(clean(s),{x,y:H-top-size,size,font:strong?bold:font,color});
 const rect=(x:number,top:number,w:number,h:number,color=navy)=>page.drawRectangle({x,y:H-top-h,width:w,height:h,color});
 const right=(s:string,edge:number,top:number,size=8,strong=false,color=navy)=>text(s,edge-(strong?bold:font).widthOfTextAtSize(clean(s),size),top,size,strong,color);
 function newPage(){page=pdf.addPage([W,H]);rect(margin,16,width,52);page.drawImage(logo,{x:36,y:H-64,width:62,height:44});text(quote.company==='1'?'RJ Indústria e Comércio de Máquinas LTDA':companyName(quote.company),112,29,11,true,rgb(1,1,1));text('PROPOSTA COMERCIAL  |  PEÇAS E SERVIÇOS',112,48,7,false,rgb(.7,.8,.9));rect(W-190,16,166,52,blue);text('PROPOSTA Nº',W-177,22,6.5,false,rgb(1,1,1));text(number,W-177,33,16,true,rgb(1,1,1));text('Emissão: '+date,W-177,55,6.5,false,rgb(1,1,1));y=79;}
 function ensure(h:number){if(y+h>H-63)newPage();}
 function heading(label:string){ensure(30);text(label,margin,y+2,7.5,true,navy);y+=12;page.drawLine({start:{x:margin,y:H-y},end:{x:W-margin,y:H-y},thickness:.6,color:line});y+=6;}
 function columns(left:[string,string][],right:[string,string][]){
 const col=(width-24)/2;const rows=Math.max(left.length,right.length);
 for(let i=0;i<rows;i++){const a=left[i],b=right[i];const al=a?wrap(a[1],col):[],bl=b?wrap(b[1],col):[];const count=Math.max(al.length,bl.length);ensure(26);if(a)text(a[0],margin,y,6.5,true,gray);if(b)text(b[0],margin+col+24,y,6.5,true,gray);y+=8;for(let j=0;j<count;j++){ensure(12);if(al[j])text(al[j],margin,y);if(bl[j])text(bl[j],margin+col+24,y);y+=9;}y+=1;}
 }
 function compactFields(rows:[string,string][][]){
 const gap=14,col=(width-gap*3)/4;
 for(const fields of rows){
 const lines=fields.map(field=>wrap(field[1],col,7.5));
 const height=9+Math.max(...lines.map(l=>l.length))*9+4;
 ensure(height);
 fields.forEach((field,i)=>{const x=margin+i*(col+gap);text(field[0],x,y,6,true,gray);lines[i].forEach((v,j)=>text(v,x,y+9+j*9,7.5));});
 y+=height;
 }
 }
 newPage();heading('DADOS DO CLIENTE / VENDEDOR E CONDIÇÕES');
 columns([['RAZÃO SOCIAL / FANTASIA',quote.client]], [['VENDEDOR',quote.responsible||'']]);
 compactFields([
 [['CNPJ / CPF',(customer.document||'').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')],['CIDADE / UF',[customer.city,customer.state].filter(Boolean).join(' / ')],['E-MAIL / TELEFONE',''],['PAGAMENTO','']],
 [['ENDEREÇO',customer.address||''],['CONTATO / TELEFONE',''],['FRETE',''],['VALIDADE','']],
 ]);
 heading('IDENTIFICAÇÃO DO EQUIPAMENTO / ESCOPO DOS SERVIÇOS');
 columns([['EQUIPAMENTO',quote.equipment],['MODELO',quote.model],['Nº DE SÉRIE',quote.serial]], [['SERVIÇO',[quote.serviceType,quote.interval].filter(Boolean).join(' · ')],['ESCOPO / OBSERVAÇÕES',quote.notes],['PRAZO DE ENTREGA','']]);
 const xs=[24,76,366,446,495,535,613,658,701,765];
 function tableHeader(label:string){ensure(40);text(label,margin,y,8,true,blue);y+=13;rect(margin,y,width,15);['CÓDIGO','DESCRIÇÃO / UN.','PRAZO DE ENTREGA','NCM','QTD','VL. UNIT. R$','ICMS %','IPI %','VL. IPI R$','TOTAL R$'].forEach((v,i)=>text(v,xs[i]+3,y+4,6,true,rgb(1,1,1)));y+=18;}
 for(const kind of ['material','service'] as const){
 const selected=quote.items.filter(i=>i.selected&&i.kind===kind);
 if(!selected.length)continue;
 const title=kind==='material'?'MATERIAIS':'SERVIÇOS';
 tableHeader(title+'  /  '+selected.length+' '+(selected.length===1?'ITEM':'ITENS'));
 for(const item of selected){
 const lines=wrap(item.name+(item.unit?' · '+item.unit:''),280,7.5);
 for(let start=0;start<lines.length;){
 if(y+14>H-63){newPage();tableHeader(title+' (CONTINUAÇÃO)');}
 const fits=Math.max(1,Math.floor((H-65-y)/9.5)),part=lines.slice(start,start+fits),height=part.length*9.5+3;
 
 if(start===0){
 const delivery=deliveryDeadline(item,quote.company);
 if(delivery)text(delivery,369,y,7,false,navy);
 text(item.code,29,y,6.8,false,gray);
 right(Number(item.quantity).toLocaleString('pt-BR'),525,y,7);
 right(money(Math.round(Number(item.price)*100)).replace('R$ ',''),603,y,7);
 const amount=money(lineAmount(item)!).replace('R$ ','');
 right(amount,W-margin-6,y,Math.min(7,48/bold.widthOfTextAtSize(amount,1)),true);
 }
 part.forEach((v,i)=>text(v,79,y+i*9.5,7.5));
 y+=height;start+=part.length;
 }
 }
 page.drawLine({start:{x:margin,y:H-y},end:{x:W-margin,y:H-y},thickness:.4,color:line});y+=3;
 }
 ensure(111);heading('OBSERVAÇÕES E CONDIÇÕES COMERCIAIS');
 const tx=W-285;text('Materiais',tx,y,8);right(money(totals.materials),W-margin-8,y,8);y+=14;text('Serviços',tx,y,8);right(money(totals.services),W-margin-8,y,8);y+=14;
 page.drawLine({start:{x:tx,y:H-y},end:{x:W-margin,y:H-y},thickness:.6,color:line});text('VALOR TOTAL',tx,y+7,9,true,navy);right(money(totals.total),W-margin-8,y+6,11,true,navy);y+=30;
 const confirmation=`Confirmo o(s) pedido(s) referente(s) ao orçamento nº ${number}${date?' - '+date:''}, autorizando a emissão da(s) nota(s) fiscal(is) no total de ${money(totals.total)}.`;
 const conf=wrap(confirmation,width-210,7);ensure(conf.length*10+25);rect(margin,y,width,Math.max(35,conf.length*10+12),rgb(.96,.97,.98));conf.forEach((v,i)=>text(v,margin+8,y+7+i*10,7,false,gray));page.drawLine({start:{x:W-215,y:H-y-20},end:{x:W-35,y:H-y-20},thickness:.6,color:navy});text('Assinatura do responsável     Data: ____/____/________',W-214,y+24,6,false,gray);
 pdf.getPages().forEach((p,i)=>{page=p;rect(margin,H-43,width,25);text('RJ COMPRESSORES   /   SERRANA COMPRESSORES   /   CRICIÚMA COMPRESSORES',margin+10,H-35,7,true,rgb(1,1,1));text(`${i+1} / ${pdf.getPageCount()}`,W-65,H-35,8,false,rgb(1,1,1));});
 return pdf.save();
}

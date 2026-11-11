import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {PDFDocument,PDFString,StandardFonts,rgb} from 'pdf-lib';
import {REPORT_CREDIT,REPORT_PHONE,REPORT_WHATSAPP_URL} from './brand';

/** Shared low-profile footer. Body content must stay above 45 PDF points. */
export async function addReportFooter(pdf:PDFDocument,title:string,margin=24){
 const font=await pdf.embedFont(StandardFonts.Helvetica);
 const logo=await pdf.embedPng(await readFile(path.join(process.cwd(),'public/branding/gw-solucoes-digitais.png')));
 const ink=rgb(.15,.27,.37),muted=rgb(.39,.46,.52),navy=rgb(.028,.102,.188);
 const pages=pdf.getPages();
 for(const [index,page] of pages.entries()){
  const width=page.getWidth(),brandX=margin+49;
  page.drawLine({start:{x:margin,y:37},end:{x:width-margin,y:37},thickness:.6,color:ink});
  page.drawRectangle({x:margin,y:9,width:43,height:25,color:navy});
  const size=logo.scaleToFit(38,21);
  page.drawImage(logo,{x:margin+(43-size.width)/2,y:9+(25-size.height)/2,...size});
  page.drawText(REPORT_CREDIT,{x:brandX,y:25,size:5,font,color:muted});
  // WhatsApp outline, deliberately in the same muted tone as the phone.
  page.drawSvgPath('M20.5 11.8a8.5 8.5 0 0 1-12.6 7.5L3 21l1.6-4.8a8.5 8.5 0 1 1 15.9-4.4Z M8.1 7.1c-.8.2-1.1 1-.8 2 .7 2.5 3.1 5 5.6 5.8 1 .3 1.9 0 2.2-.8l.4-1-2.5-1.3-.9 1c-1.3-.6-2.4-1.6-3-2.9l.9-.9-1.1-2.3Z',
   {x:brandX,y:21,scale:.34,borderColor:muted,borderWidth:1.4});
  page.drawText(REPORT_PHONE,{x:brandX+11,y:14,size:7,font,color:muted});
  const pageText=`Página ${index+1} de ${pages.length}`,titleSize=7;
  page.drawText(title,{x:(width-font.widthOfTextAtSize(title,titleSize))/2,y:21,size:titleSize,font,color:ink});
  page.drawText(pageText,{x:width-margin-font.widthOfTextAtSize(pageText,7),y:21,size:7,font,color:ink});
  page.node.addAnnot(pdf.context.register(pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[margin,8,brandX+Math.max(font.widthOfTextAtSize(REPORT_CREDIT,5),100),35],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of(REPORT_WHATSAPP_URL)}})));
 }
}

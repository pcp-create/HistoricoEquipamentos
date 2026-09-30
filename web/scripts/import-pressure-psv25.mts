import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as XLSX from 'xlsx';
import {database} from '../lib/db';
import {normalizeCode,validCode} from '../lib/manufacturer/rules';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const filename=process.argv[2];
if(!filename)throw Error('Informe PSV25 AP.pdf; acrescente --apply para gravar.');
const source=path.resolve(filename),bytes=readFileSync(source);
const data=JSON.parse(execFileSync('python3',[path.join(root,'scripts/prepare_pressure_psv25.py'),source],{encoding:'utf8'}));
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
if(hash(bytes)!==data.sha256)throw Error('O arquivo mudou durante a leitura.');
const revision='pressure-psv25ap:'+data.sha256,variant=hash(revision+':PSV25AP');
const conditions='Cabeçote de alta pressão, 2 estágios, 175 PSI. Início de fabricação: novembro/2002. Fonte: PSV25 AP.pdf, Rev. 00, 06/2014. Modelos citados: AT32 250V, ON25 250V e SPART 25V. Sem faixa de série ou intervalo de manutenção informado.';
const warning='Volume de óleo divergente na fonte: 950 ml na página 2 e 650 ml na página 3 (AW150). Conferir com o fabricante antes de abastecer; não foi definido volume de manutenção.';
const header=['Pressure','PSV25AP','PSV25 AP / PSV 25 AP','Aplicação somente por modelo',conditions,warning];
const entries=data.rows.map((r:any,i:number)=>{
 const code=r.reference==='#'?null:normalizeCode(r.reference);
 if(code&&!validCode(code))throw Error('Referência inválida na posição '+r.position);
 return {id:hash(variant+':'+r.position),variant_id:variant,sheet:'PSV25 AP.pdf — página 3',row:i+1,section:r.section,description:r.description,
  code_original:r.reference,code,interval_original:'',interval_hours:null,
  observation:`Quantidade na lista: ${r.quantity}. Código da vista: ${r.position}. Fonte: PSV25 AP.pdf, página 3, Rev. 00 (06/2014). Sem intervalo de manutenção informado.`+(code?'':' # Peça comum de mercado não comercializada pela Pressure; referência não informada.'),
  issues:code?[]:['Código # na origem: peça comum de mercado não comercializada pela Pressure.']};
});
const report={managed:true,sourceType:'manufacturer-pdf-parts',source:data.source,sha256:data.sha256,manufacturer:'Pressure',model:'PSV25AP',version:data.version,pages:data.pages,items:entries.length,withoutCode:entries.filter((e:any)=>!e.code).length,warnings:[warning],variantId:variant};
const output=path.join(root,'docs/catalogos'),archive=path.join(root,'.m8/manufacturer');
mkdirSync(output,{recursive:true});mkdirSync(archive,{recursive:true,mode:0o700});
copyFileSync(source,path.join(archive,data.sha256+'.pdf'));
writeFileSync(path.join(output,'pressure-psv25ap.report.json'),JSON.stringify(report,null,2)+'\n');
const workbook=XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(data.rows.map((r:any)=>({Fabricante:'Pressure',Modelo:'PSV25AP',Versão:data.version,Grupo:r.section,'Descrição da peça':r.description,'Referência genuína — original':r.reference,Quantidade:r.quantity,'Código da vista':r.position,'Intervalo em horas':'','Página de origem':r.page,Observações:r.reference==='#'?'Peça comum de mercado não comercializada pela Pressure.':''}))), 'Itens');
XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['Informações'],['Origem',data.source],['SHA256',data.sha256],['Aplicação',conditions],['Conferência',warning],['Códigos','Referências genuínas preservadas; # permanece sem vínculo. Códigos repetidos em posições distintas são mantidos.'],['Importação','Usar scripts/import-pressure-psv25.mts. Não utilizar o importador genérico de planilhas.']]),'Instruções');
writeFileSync(path.join(output,'pressure-psv25ap.xlsx'),XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}));
writeFileSync(path.join(archive,data.sha256+'.report.json'),JSON.stringify({...report,entries},null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(report));
const db=database();
try{
 const prior=(await db.query('SELECT id FROM manufacturer_revisions WHERE id=$1',[revision])).rows;
 console.log(prior.length?'Arquivo já cadastrado.':'Nova revisão adicional; nenhum catálogo existente será substituído.');
 if(process.argv.includes('--apply')){
  const c=await db.connect();
  try{
   await c.query('BEGIN READ WRITE');await c.query('SELECT pg_advisory_xact_lock(81015,1)');
   const inserted=await c.query('INSERT INTO manufacturer_revisions(id,filename,report) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',[revision,data.source,JSON.stringify(report)]);
   if(inserted.rowCount){
    await c.query('INSERT INTO manufacturer_variants(id,revision_id,name,header,models,rules,issues) VALUES($1,$2,$3,$4,$5,$6,$7)',[variant,revision,'Pressure · PSV25AP · Rev. 00 — 06/2014',JSON.stringify(header),JSON.stringify(['PSV25AP']),'[]',JSON.stringify([warning])]);
    await c.query(`INSERT INTO manufacturer_entries(id,variant_id,sheet,row_number,section,description,code_original,code,observation,interval_original,interval_hours,issues)
     SELECT p.id,p.variant_id,p.sheet,p.row,p.section,p.description,p.code_original,p.code,p.observation,p.interval_original,p.interval_hours,p.issues FROM jsonb_to_recordset($1::jsonb) AS p(id text,variant_id text,sheet text,row integer,section text,description text,code_original text,code text,observation text,interval_original text,interval_hours numeric,issues jsonb)`,[JSON.stringify(entries)]);
   }
   const saved=(await c.query('SELECT count(*)::int AS items,count(*) FILTER(WHERE code IS NULL)::int AS uncoded FROM manufacturer_entries WHERE variant_id=$1',[variant])).rows[0];
   if(saved.items!==56||saved.uncoded!==8)throw Error('Contagem de conferência divergente; importação cancelada.');
   await c.query('COMMIT');console.log(JSON.stringify({result:inserted.rowCount?'Importação confirmada':'Já importado, sem duplicação',...saved}));
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 }
}finally{await db.end();}

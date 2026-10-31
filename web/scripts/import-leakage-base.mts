import {readFileSync}from'node:fs';
import{saveLeakage}from'../lib/leakage-reports/store';
import{database}from'../lib/db';
try{
 if(process.argv.length!==3)throw Error('Informe o JSON preparado a partir da planilha.');
 const rows=JSON.parse(readFileSync(process.argv[2],'utf8'));
 if(!Array.isArray(rows)||rows.length>100)throw Error('Base inválida.');
 for(const row of rows){if(typeof row.sourceKey!=='string'||!row.sourceKey.startsWith('workbook:'))throw Error('Origem inválida.');const saved=await saveLeakage({document:row.document},'Importação da planilha',row.sourceKey);console.log(JSON.stringify({client:row.document.client,machines:row.document.machines.length,id:saved.id,skipped:!!saved.skipped}));}
}catch(e){console.error(e instanceof Error?e.message:'Falha na importação.');process.exitCode=1;}finally{await database().end();}

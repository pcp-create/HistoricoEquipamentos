import {test} from 'node:test';import assert from 'node:assert/strict';import * as XLSX from 'xlsx';
import {rentalExportRows} from '../lib/equipment-management/rental-export';

test('Excel export preserves all filtered machines, identifiers and contract details',()=>{
 const equipment=Array.from({length:35},(_,i)=>({id:String(20000+i),internal_code:i===0?'00131':String(i),name:'Compressor '+i,serial:'00'+i,rental:true,clients:[],rentalStatus:{label:'Locado',customer:'Cliente',contract:{start:'2026-11-01',end:'2026-12-01',duration:30,remaining:7,label:'Dentro do prazo'}},location:'RJ'}));
 const rows=rentalExportRows(equipment),book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows),'Equipamentos');
 const restored=XLSX.read(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));const exported=XLSX.utils.sheet_to_json<any>(restored.Sheets.Equipamentos);
 assert.equal(exported.length,35);assert.equal(exported[0]['ID interno'],'00131');assert.equal(exported[0]['Número de série'],'000');assert.equal(exported[0]['Cliente'],'Cliente');assert.equal(exported[0]['Vigência (dias)'],30);assert.equal(exported[34]['Código'],'20034');
});

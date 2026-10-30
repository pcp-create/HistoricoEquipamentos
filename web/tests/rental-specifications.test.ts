import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rentalEquipmentType,rentalSpecifications,matchesRentalSpecification,rentalSpecificationRanges,rentalPcmRanges} from '../lib/equipment-management/rental-specifications';
test('extracts rental ratings with decimal separators, leading zeros and different units',()=>{
 assert.deepEqual(rentalSpecifications('COMPRESSOR 006HP - 55,9PCM - ROTOR 06 - 9.0 BAR - 380V/60HZ'),{hp:'6',pcm:'55.9',pressure:'9 BAR'});
 assert.deepEqual(rentalSpecifications('COMPRESSOR PISTÃO 60PCM - CJ60 - 15 HP - 175LBS'),{hp:'15',pcm:'60',pressure:'175 LBS'});
 assert.deepEqual(rentalSpecifications('SECADOR 0110PCM - TITAN PLUS 110 - 12 BAR'),{hp:'',pcm:'110',pressure:'12 BAR'});
 assert.deepEqual(rentalSpecifications('MODELO HP25 PCM100 - 380V/60HZ'),{hp:'',pcm:'',pressure:''});
});

test('ranges use inclusive bounds, exclude missing values and preserve pressure units',()=>{
 for(const value of ['0','30']) assert.equal(matchesRentalSpecification(value,'0-30','hp'),true);
 assert.equal(matchesRentalSpecification('30.5','0-30','hp'),false);
 assert.equal(matchesRentalSpecification('55.9','41-80','pcm'),true);
 assert.equal(matchesRentalSpecification('250','161-250','pcm'),true);
 assert.equal(matchesRentalSpecification('250','251-400','pcm'),false);
 assert.equal(matchesRentalSpecification('250.1','251-400','pcm'),true);
 assert.equal(matchesRentalSpecification('','0-30','hp'),false);
 assert.equal(matchesRentalSpecification('','missing','hp'),true);
 assert.equal(matchesRentalSpecification('9 BAR','9 PSI','pressure'),false);
});


test('HP ranges cover every boundary exactly once, including decimal ratings',()=>{
 const cases:[number,string][]=[[0,'0-30'],[30,'0-30'],[30.5,'31-60'],[31,'31-60'],[60,'31-60'],[60.5,'61-100'],[61,'61-100'],[74,'61-100'],[100,'61-100'],[100.5,'101-250'],[101,'101-250'],[124,'101-250'],[250,'101-250'],[250.1,'over-250'],[1000,'over-250']];
 for(const key of ['hp'] as const){
  for(const [value,id] of cases)assert.deepEqual(rentalSpecificationRanges.filter(r=>matchesRentalSpecification(String(value),r.id,key)).map(r=>r.id),[id]);
  for(const value of ['-1','NaN',''])assert.equal(rentalSpecificationRanges.some(r=>matchesRentalSpecification(value,r.id,key)),false);
 }
});


test('PCM ranges cover all requested intervals without gaps or overlaps',()=>{
 const ranges=['0-40','41-80','81-120','121-160','161-250','251-400','401-700','701-990','over-990'];
 assert.deepEqual(rentalPcmRanges.map(r=>r.id),ranges);
 for(const [index,range] of rentalPcmRanges.entries()){
  const values=index===0?[0,40]:[range.min+0.1,range.min+1,Number.isFinite(range.max)?range.max:2000];
  for(const value of values)assert.deepEqual(rentalPcmRanges.filter(r=>matchesRentalSpecification(String(value),r.id,'pcm')).map(r=>r.id),[range.id]);
 }
 for(const value of ['-1','NaN',''])assert.equal(rentalPcmRanges.some(r=>matchesRentalSpecification(value,r.id,'pcm')),false);
});


test('exact HP and PCM filters match only the selected numeric rating',()=>{
 for(const key of ['hp','pcm'] as const){
  assert.equal(matchesRentalSpecification('55.9','exact:55.9',key),true);
  for(const value of ['30','60'])assert.equal(matchesRentalSpecification(value,'exact:30,60',key),true);
  assert.equal(matchesRentalSpecification('45','exact:30,60',key),false);
  assert.equal(matchesRentalSpecification('55.90','exact:55.9',key),true);
  for(const value of ['55','56','','NaN'])assert.equal(matchesRentalSpecification(value,'exact:55.9',key),false);
  for(const filter of ['exact:','exact:NaN'])assert.equal(matchesRentalSpecification('0',filter,key),false);
 }
});

 test('equipment type recognizes registration names independently of accents and casing',()=>{
 for(const [name,type] of [
 ['COMPRESSOR DE PARAFUSO 25HP','Compressor Parafuso'],
 ['compressor pistão 20PCM','Compressor Pistão'],
 ['UNIDADE COMPRESSORA PISTÃO 60PCM','Unidade Compressora Pistão'],
 ['SECADOR DE AR 150PCM','Secador de Ar'],
 ['SEPARADOR CONDENSADO VERTICAL 425L','Separador de Condensado'],
 ['SEM IDENTIFICAÇÃO','Outros']
 ]) assert.equal(rentalEquipmentType(name),type);
 });

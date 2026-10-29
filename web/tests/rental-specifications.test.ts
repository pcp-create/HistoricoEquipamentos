import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rentalSpecifications,matchesRentalSpecification,rentalSpecificationRanges} from '../lib/equipment-management/rental-specifications';
test('extracts rental ratings with decimal separators, leading zeros and different units',()=>{
 assert.deepEqual(rentalSpecifications('COMPRESSOR 006HP - 55,9PCM - ROTOR 06 - 9.0 BAR - 380V/60HZ'),{hp:'6',pcm:'55.9',pressure:'9 BAR'});
 assert.deepEqual(rentalSpecifications('COMPRESSOR PISTÃO 60PCM - CJ60 - 15 HP - 175LBS'),{hp:'15',pcm:'60',pressure:'175 LBS'});
 assert.deepEqual(rentalSpecifications('SECADOR 0110PCM - TITAN PLUS 110 - 12 BAR'),{hp:'',pcm:'110',pressure:'12 BAR'});
 assert.deepEqual(rentalSpecifications('MODELO HP25 PCM100 - 380V/60HZ'),{hp:'',pcm:'',pressure:''});
});

test('ranges use inclusive bounds, exclude missing values and preserve pressure units',()=>{
 for(const value of ['0','30']) assert.equal(matchesRentalSpecification(value,'0-30','hp'),true);
 assert.equal(matchesRentalSpecification('30.5','0-30','hp'),false);
 assert.equal(matchesRentalSpecification('55.9','31-60','pcm'),true);
 assert.equal(matchesRentalSpecification('250','101-250','pcm'),true);
 assert.equal(matchesRentalSpecification('250','over-250','pcm'),false);
 assert.equal(matchesRentalSpecification('250.1','over-250','pcm'),true);
 assert.equal(matchesRentalSpecification('','0-30','hp'),false);
 assert.equal(matchesRentalSpecification('','missing','hp'),true);
 assert.equal(matchesRentalSpecification('9 BAR','9 PSI','pressure'),false);
});


test('HP and PCM ranges cover every boundary exactly once, including decimal ratings',()=>{
 const cases:[number,string][]=[[0,'0-30'],[30,'0-30'],[30.5,'31-60'],[31,'31-60'],[60,'31-60'],[60.5,'61-100'],[61,'61-100'],[74,'61-100'],[100,'61-100'],[100.5,'101-250'],[101,'101-250'],[124,'101-250'],[250,'101-250'],[250.1,'over-250'],[1000,'over-250']];
 for(const key of ['hp','pcm'] as const){
  for(const [value,id] of cases)assert.deepEqual(rentalSpecificationRanges.filter(r=>matchesRentalSpecification(String(value),r.id,key)).map(r=>r.id),[id]);
  for(const value of ['-1','NaN',''])assert.equal(rentalSpecificationRanges.some(r=>matchesRentalSpecification(value,r.id,key)),false);
 }
});

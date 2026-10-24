import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchesSearch,searchPatterns} from '../lib/filters';
test('search requires all words regardless of order, accents or repeated spaces',()=>{
 for(const query of ['FILTRO AR','AR FILTRO','  ar   FÍLTRO ','filtro filtro ar']) assert.equal(matchesSearch('100 - FILTRO DE AR',query),true);
 assert.equal(matchesSearch('FILTRO DE ÓLEO','filtro ar'),false);
 assert.equal(matchesSearch('FILTRO DE AR',''),true);
 assert.equal(matchesSearch('50%_\\','%_\\'),true);
});
test('SQL search uses separate literal patterns, not a phrase or wildcard user input',()=>{
 assert.deepEqual(searchPatterns('AR FILTRO'),['%AR%','%FILTRO%']);
 assert.deepEqual(searchPatterns('  '),[]);
 assert.deepEqual(searchPatterns('50% A_B'),['%50\\%%','%A\\_B%']);
});

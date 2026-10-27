import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatContactPhone} from '../lib/contact-phone';
test('formats mobile, landline, pasted country code and partial input',()=>{
 assert.equal(formatContactPhone('49999999999'),'(49) 99999-9999');
 assert.equal(formatContactPhone('4933334444'),'(49) 3333-4444');
 assert.equal(formatContactPhone('+55 (49) 99999-9999'),'(49) 99999-9999');
 assert.equal(formatContactPhone('4'),'(4');
 assert.equal(formatContactPhone('499'),'(49) 9');
 assert.equal(formatContactPhone(''), '');
});

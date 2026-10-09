const {test}=require('node:test');
const assert=require('node:assert/strict');
const {patchSource}=require('./fix-list-serialization.cjs');
const original='const x={patchMessageBeforeSending(l){return l.deviceSentMessage?.message?.listMessage?.listType===R.proto.Message.ListMessage.ListType.PRODUCT_LIST&&(l=JSON.parse(JSON.stringify(l)),l.deviceSentMessage.message.listMessage.listType=R.proto.Message.ListMessage.ListType.SINGLE_SELECT),l.listMessage?.listType===R.proto.Message.ListMessage.ListType.PRODUCT_LIST&&(l=JSON.parse(JSON.stringify(l)),l.listMessage.listType=R.proto.Message.ListMessage.ListType.SINGLE_SELECT),l}};';
test('correção limitada ao hook, duas cópias, idempotência e sintaxe',()=>{
 const fixed=patchSource(original);
 assert.equal((fixed.match(/Message.decode/g)||[]).length,2);
 assert.ok(!fixed.includes('JSON.stringify'));
 assert.equal(patchSource(fixed),fixed);
 new Function(fixed);
 const outside='const unrelated=JSON.parse(JSON.stringify(other));';
 assert.ok(patchSource(original+outside).endsWith(outside));
});
test('interrompe diante de código diferente ou função ambígua',()=>{
 assert.throws(()=>patchSource(''),/ausente/);
 assert.throws(()=>patchSource(original+original),/ambígua/);
 assert.throws(()=>patchSource(original.replace('JSON.parse(JSON.stringify(l))','l')),/duas/);
});

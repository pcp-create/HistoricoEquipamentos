import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {normalizeUserPhoto} from '../lib/user-photo';
test('foto é convertida para miniatura JPEG e rejeita conteúdo inválido',async()=>{
 const original=await sharp({create:{width:640,height:480,channels:3,background:'#246789'}}).png().toBuffer();
 const result=await normalizeUserPhoto(original);const info=await sharp(result).metadata();
 assert.equal(info.format,'jpeg');assert.equal(info.width,256);assert.equal(info.height,256);assert.equal(info.exif,undefined);
 await assert.rejects(()=>normalizeUserPhoto(Buffer.alloc(2*1024*1024+1)));
 await assert.rejects(()=>normalizeUserPhoto(Buffer.from('not an image')));
 await assert.rejects(()=>normalizeUserPhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')));
});

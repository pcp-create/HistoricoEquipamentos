import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {normalizeUserPhoto,userPhotoContentType} from '../lib/user-photo';
test('foto é convertida para miniatura JPEG e rejeita conteúdo inválido',async()=>{
 const original=await sharp({create:{width:640,height:480,channels:3,background:'#246789'}}).png().toBuffer();
 const result=await normalizeUserPhoto(original);const info=await sharp(result).metadata();
 assert.equal(info.format,'jpeg');assert.equal(info.width,256);assert.equal(info.height,256);assert.equal(info.exif,undefined);
 await assert.rejects(()=>normalizeUserPhoto(Buffer.alloc(2*1024*1024+1)));
 await assert.rejects(()=>normalizeUserPhoto(Buffer.from('not an image')));
 await assert.rejects(()=>normalizeUserPhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')));
});

test('preserva transparência total e parcial de PNG e WebP',async()=>{
 for(const format of ['png','webp'] as const){
  const source=sharp({create:{width:256,height:256,channels:4,background:{r:30,g:70,b:90,alpha:0.5}}});
  const input=await source[format]().toBuffer();
  const result=await normalizeUserPhoto(input);
  assert.equal(userPhotoContentType(result),'image/png');
  assert.equal((await sharp(result).metadata()).hasAlpha,true);
  const {data,info}=await sharp(result).raw().toBuffer({resolveWithObject:true});
  assert.equal(info.channels,4);
  assert.ok(data[3]>=127&&data[3]<=128);
 }
 const transparent=await sharp({create:{width:256,height:256,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
 const result=await normalizeUserPhoto(transparent);
 assert.equal((await sharp(result).raw().toBuffer())[3],0);
});
test('serve fotos JPEG antigas com seu tipo original',async()=>{
 const jpeg=await sharp({create:{width:10,height:10,channels:3,background:'#123456'}}).jpeg().toBuffer();
 assert.equal(userPhotoContentType(jpeg),'image/jpeg');
});

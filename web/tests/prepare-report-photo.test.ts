import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {chromium} from '@playwright/test';

test('browser reduces large photos, preserves small images and validates uploads', async () => {
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  const source=readFileSync('lib/prepare-report-photo.ts','utf8').replace('export async function','async function');
  await page.addScriptTag({content:ts.transpile(source,{target:ts.ScriptTarget.ES2020})+'\nwindow.prepareReportPhoto = prepareReportPhoto;'});
  const result=await page.evaluate(async()=>{
   const prepare=(window as any).prepareReportPhoto;
   const canvas=document.createElement('canvas');canvas.width=3000;canvas.height=1500;
   const ctx=canvas.getContext('2d')!;ctx.fillStyle='red';ctx.fillRect(0,0,3000,1500);
   const blob=await new Promise<Blob>(r=>canvas.toBlob(b=>r(b!),'image/png'));
   // Valid PNG with padding simulates a camera file above the previous 3 MB limit.
   const file=new File([blob,new Uint8Array(4*1024*1024)],'camera.png',{type:'image/png'});
   const output=await prepare(file);
   const bitmap=await createImageBitmap(output);
   const dimensions=[bitmap.width,bitmap.height];bitmap.close();
   canvas.width=100;canvas.height=100;
   const tiny=await new Promise<Blob>(r=>canvas.toBlob(b=>r(b!),'image/png'));
   const original=new File([tiny],'signature.png',{type:'image/png'});
   const unchanged=await prepare(original)===original;
   const errors=[];
   for(const invalid of [new File([new Uint8Array(20*1024*1024+1)],'large.jpg',{type:'image/jpeg'}),new File(['bad'],'bad.png',{type:'image/png'}),new File(['svg'],'a.svg',{type:'image/svg+xml'})]){
    try{await prepare(invalid);errors.push(false)}catch{errors.push(true)}
   }
   return {dimensions,type:output.type,size:output.size,name:output.name,unchanged,errors};
  });
  assert.deepEqual(result.dimensions,[2000,1000]);
  assert.equal(result.type,'image/jpeg');assert.equal(result.name,'camera.jpg');
  assert.ok(result.size<3*1024*1024);assert.equal(result.unchanged,true);
  assert.deepEqual(result.errors,[true,true,true]);
 } finally { await browser.close(); }
});

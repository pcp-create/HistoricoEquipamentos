import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from '@playwright/test';
test('folder imports resolve XML paths, keep duplicate names separate, add folders and survive project reload',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'leak-folders-')),browser=await chromium.launch();
 try{
 const root=path.join(dir,'Export');const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6zS8AAAAASUVORK5CYII=','base64');
 for(const folder of ['BM_A','BM_B','unrelated']){await mkdir(path.join(root,folder),{recursive:true});await writeFile(path.join(root,folder,'BM_00000.jpg'),pixel);}
 await writeFile(path.join(root,'note.txt'),'not an image');
 const page=await browser.newPage();const html=await readFile(new URL('../public/tools/leak-report.html',import.meta.url),'utf8');
 await page.route('http://report.test/**',async route=>{const pathname=new URL(route.request().url()).pathname;if(pathname.startsWith('/api/'))return route.fulfill({contentType:'image/png',body:pixel});if(pathname.startsWith('/tools/')||pathname.startsWith('/fonts/')||pathname==='/logo-rj.png')return route.fulfill({contentType:pathname.endsWith('.css')?'text/css':pathname.endsWith('.js')||pathname.endsWith('.mjs')?'text/javascript':undefined,body:await readFile(new URL('../public'+pathname,import.meta.url))});return route.fulfill({contentType:'text/html',body:html});});
 await page.goto('http://report.test');
 const xml='<JOURNAL>'+['BM_A','bm_b\\','BM_C'].map((folder,i)=>`<JNL><INFO LeakTag="${i+1}"/><INFO Company="Teste"/><RES Leakage="1" Cost="1"/><BMP Path="${folder}" Name="BM_00000.jpg"/></JNL>`).join('')+'</JOURNAL>';
 await page.locator('#xmlInput').setInputFiles({name:'test.xml',mimeType:'text/xml',buffer:Buffer.from(xml)});
 await page.locator('#imgInput').setInputFiles({name:'BM_00000.jpg',mimeType:'image/jpeg',buffer:pixel});
 assert.equal(await page.locator('.image-box img').count(),0,'ambiguous flat filenames must not fill different folder references');
 await page.locator('#imgFolderInput').setInputFiles(path.join(root,'BM_A'));assert.equal(await page.locator('.image-box img').count(),1);
 await page.locator('#imgFolderInput').setInputFiles(path.join(root,'BM_B'));assert.equal(await page.locator('.image-box img').count(),2);
 await page.locator('#imgFolderInput').setInputFiles(root);assert.equal(await page.locator('.image-box img').count(),2);assert.equal(await page.evaluate(()=>(window as any).rjLeakProject.get().images.length),2);
 await page.evaluate((xml)=>(window as any).rjLeakProject.load({xml,images:[]}),xml);
 await page.locator('#imgFolderInput').setInputFiles(root);
 assert.equal(await page.locator('.image-box img').count(),2);assert.match(await page.locator('#imageImportFeedback').innerText(),/2 de 3/);
 const images=await page.evaluate(()=>(window as any).rjLeakProject.get().images);
 assert.equal(images.length,2,'unrelated images and other files are ignored');assert.notEqual(images[0][1],images[1][1]);assert.ok(images.every(([name]:any)=>name.startsWith('bm_a/')||name.startsWith('bm_b/')));
 await page.evaluate(({xml,images})=>(window as any).rjLeakProject.load({xml,images:images.map(([name]:any,i:number)=>({name,assetId:'asset-'+i}))}),{xml,images});
 assert.equal(await page.locator('.image-box img').count(),2);assert.match(await page.locator('#imageImportFeedback').innerText(),/2 de 3/);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{await browser.close();await rm(dir,{recursive:true,force:true});}
});

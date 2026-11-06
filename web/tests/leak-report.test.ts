import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

test('LeakReporter import, escaping, adjustments, images, mobile and print', async () => {
 const browser = await chromium.launch({headless:true});
 try {
  const page = await browser.newPage();
  const html = await readFile(new URL('../public/tools/leak-report.html', import.meta.url), 'utf8');
  await page.route('http://report.test/**', async route => {
  const path=new URL(route.request().url()).pathname;
  if(path.startsWith('/tools/'))return route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/javascript',body:await readFile(new URL('../public'+path,import.meta.url))});
  if(path.startsWith('/fonts/')||path==='/logo-rj.png')return route.fulfill({body:await readFile(new URL('../public'+path,import.meta.url))});
  return route.fulfill({contentType:'text/html',body:html});
 });
  await page.goto('http://report.test/editor');
  assert.equal(await page.locator('#btnPrint').isDisabled(),true);
  const xml = '<ROOT><JNL><INFO Date="20/10/2026" Time="10:00"/><INFO Company="Cliente teste" Location="Oficina" Place="Geral"/><INFO LeakTag="&lt;img src=x onerror=alert(1)&gt;"/><INFO CommF="Uniao" CommM="Trocar"/><DATA Level="20"/><DATA Pressure="7" UnitP="bar"/><RES Leakage="10" Cost="600" UnitL="ltr/min"/><BMP Name="ponto.png"/></JNL></ROOT>';
  await page.locator('#xmlInput').setInputFiles({name:'teste.xml',mimeType:'text/xml',buffer:Buffer.from(xml)});
  await page.locator('.leak-card').waitFor();
  assert.equal(await page.locator('#qtdFugas').textContent(),'1');
  assert.match(await page.locator('#custoTotal').innerText(),/600,00/);
  assert.equal(await page.locator('.tag img').count(),0);
  assert.equal(await page.locator('.chart-label img').count(),0);
  assert.match(await page.locator('.chart-label').innerText(),/Edifício \/ Local: Oficina · Geral/);
  assert.match(await page.locator('.chart-label').innerText(),/TAG/);
  await page.locator('#btnToggleSettings').click();
  await page.locator('#empresaInput').fill('Cliente corrigido');
  await page.locator('#localizacaoInput').fill('CristalCopo');
  await page.locator('#areaInput').fill('Área geral do cliente');
  await page.locator('#btnApplySettings').click();
  assert.match(await page.locator('.chart-label').innerText(),/Oficina · Geral/);
  assert.doesNotMatch(await page.locator('.chart-label').innerText(),/CristalCopo|Área geral do cliente/);
  assert.match(await page.locator('.leak-card').innerText(),/Oficina · Geral/);
  assert.equal(await page.locator('.chart-label strong').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  await page.locator('#edificioLocalInput').fill('Galpão B · Linha 3');
  await page.locator('#serviceOrderInput').fill('14948/01');
  await page.locator('#btnApplySettings').click();
  assert.equal(await page.locator('#empresa').innerText(),'Cliente corrigido');
  assert.equal(await page.locator('#reportOsValue').innerText(),'14948/01');
  assert.match(await page.locator('.chart-label').innerText(),/Edifício \/ Local: Galpão B · Linha 3/);
  await page.locator('#imgInput').setInputFiles({name:'ponto.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6zS8AAAAASUVORK5CYII=','base64')});
  assert.equal(await page.locator('.image-box img').count(),1);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.emulateMedia({media:'print'});
  assert.equal(await page.locator('.topbar').isVisible(),false);
  assert.equal(await page.locator('#report').isVisible(),true);
  const eightPoints='<ROOT>'+Array.from({length:8},(_,i)=>xml.slice(6,-7).replace('LeakTag="&lt;img src=x onerror=alert(1)&gt;"',`LeakTag="${i+1}"`)).join('')+'</ROOT>';
  await page.locator('#xmlInput').setInputFiles({name:'oito-pontos.xml',mimeType:'text/xml',buffer:Buffer.from(eightPoints)});
  await page.evaluate(()=>document.fonts.ready);
  const pdf=await page.pdf({preferCSSPageSize:true});
  assert.equal((await PDFDocument.load(pdf)).getPageCount(),5,'one overview page and four pages with two leak cards each');
  const clipped=await page.locator('.leak-card').evaluateAll(cards=>cards.some(card=>{
   const bounds=card.getBoundingClientRect(),notes=card.querySelector('.comments')!.getBoundingClientRect();
   const image=card.querySelector('.image-box')!.getBoundingClientRect();
   return notes.bottom>bounds.bottom-4||image.bottom>bounds.bottom-4;
  }));
  assert.equal(clipped,false,'notes and photos must fit inside their cards with bottom spacing');
  await page.locator('#xmlInput').setInputFiles({name:'bad.xml',mimeType:'text/xml',buffer:Buffer.from('<broken>')});
  await page.waitForFunction(()=>document.getElementById('importFeedback')?.classList.contains('error'));
  assert.equal(await page.locator('#btnPrint').isDisabled(),true);
 } finally {await browser.close();}
});

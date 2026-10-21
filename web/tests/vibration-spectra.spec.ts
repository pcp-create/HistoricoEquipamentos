import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('spectra belong to each point, survive project export/import and print in three fixed columns',async({page,context})=>{
 await context.addCookies([{name:'m8-access',value:'test',domain:'localhost',path:'/'}]);
 await page.goto('/tools/vibration-report.html');
 await page.getByRole('button',{name:'Novo relatório',exact:true}).click();
 const project={version:2,title:'Relatório Técnico de Análise de Vibrações',serviceOrder:'14948',collector:'Rafael',issued:'2026-10-21',equipments:[{id:'eq',machine:'METALPLAN TPF60DD',client:'ITUTEX',selected:true,status:'Não avaliado',date:'07/10/2026',components:[{name:'Motor elétrico',date:'07/10/2026',points:[{name:'01H',velocity:2,acceleration:4.69,peak:51.16},{name:'01V',velocity:2.31,acceleration:'',peak:''}]}]}]};
 await page.locator('#openProject').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
 await page.locator('.spectrum-editor summary').first().click();
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHfsAAAAASUVORK5CYII=','base64');
 for(const type of ['Velocidade','Envelope','Aceleração']){
  await page.getByLabel('Anexar '+type+' de 01H',{exact:true}).setInputFiles({name:type+'.png',mimeType:'image/png',buffer:png});
  await expect(page.getByRole('button',{name:'Remover '+type,exact:true})).toBeVisible();
 }
 await page.locator('.spectrum-editor summary').nth(1).click();
 await page.getByLabel('Anexar Velocidade de 01V',{exact:true}).setInputFiles({name:'single.png',mimeType:'image/png',buffer:png});
 await expect(page.locator('.spectrum-thumb')).toHaveCount(4);
 await page.getByRole('button',{name:'Ampliar Velocidade de 01H',exact:true}).click();
 await expect(page.locator('dialog')).toBeVisible();await page.getByRole('button',{name:'Fechar ×'}).click();
 const downloadPromise=page.waitForEvent('download');await page.locator('#saveProject').click();
 const download=await downloadPromise;const saved=JSON.parse(await readFile((await download.path())!,'utf8'));
 expect(saved.version).toBe(3);expect(saved.equipments[0].components[0].points[0].spectra.envelope.name).toBe('Envelope.png');
 page.once('dialog',d=>d.accept());
 await page.locator('#clear').click();
 await page.locator('#openProject').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
 await expect(page.locator('.spectrum-thumb')).toHaveCount(4);
 const popupPromise=page.waitForEvent('popup');await page.locator('#preview').click();const preview=await popupPromise;await preview.waitForLoadState();
 await expect(preview.locator('.v-graphs img')).toHaveCount(4);
 await expect(preview.getByText('Espectro não fornecido')).toHaveCount(0);
 await expect(preview.locator('.v-cover-header h1')).toHaveCSS('font-size','32px');
 const first=await preview.locator('.v-graphs figure').first().boundingBox(),single=await preview.locator('.v-graphs').nth(1).locator('figure').boundingBox();
 expect(Math.abs(first!.width-single!.width)).toBeLessThan(1);expect(Math.abs(first!.x-single!.x)).toBeLessThan(1);
 await preview.emulateMedia({media:'print'});await expect(preview.locator('.v-page')).toHaveCount(3);
 // Individual and combined exports use the same attachments.
 const individualPromise=page.waitForEvent('popup');await page.locator('#individual').click();
 const individual=await individualPromise;await individual.waitForLoadState();
 await expect(individual.locator('.v-graphs img')).toHaveCount(4);
 await page.evaluate(()=>{window.print=()=>{document.body.dataset.printed='yes'}});
 await page.locator('#combined').click();
 await expect(page.locator('body')).toHaveAttribute('data-printed','yes');
 await expect(page.locator('#report .v-graphs img')).toHaveCount(4);
 await page.locator('.spectrum-editor summary').first().click();await page.getByRole('button',{name:'Remover Envelope',exact:true}).click();
 await expect(page.locator('.spectrum-thumb')).toHaveCount(3);
 // Reject a corrupt image without losing the existing attachment.
 page.once('dialog',d=>d.accept());
 await page.getByLabel('Anexar Velocidade de 01H',{exact:true}).setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not an image')});
 await expect(page.locator('.spectrum-thumb')).toHaveCount(3);
});

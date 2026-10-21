import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {saveReport,reportDetail,reportsList,saveImage,reportImage,ReportConflict,validateProject} from '../lib/vibration-reports/store';
test('saved reports retain spectra, support search and reopening, and reject stale writes atomically',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 const query=db.query.bind(db);g.historyPool={query,connect:async()=>({query,release(){}})};
 try{
  await db.exec(readFileSync(new URL('../sql/056_vibration_reports.sql',import.meta.url),'utf8'));
  await db.exec("CREATE TABLE m8_customer_directory(company_id integer,person_id bigint,name text,document text,payload jsonb,PRIMARY KEY(company_id,person_id)); INSERT INTO m8_customer_directory VALUES(1,42,'ITUTEX','123456', '{}')");
  await db.exec(readFileSync(new URL('../sql/057_vibration_report_customer.sql',import.meta.url),'utf8'));
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHfsAAAAASUVORK5CYII=','base64');
  const file=new File([png],'spectrum.png',{type:'image/png'});
  const image=await saveImage(file,'tech@test.com');
  assert.equal((await saveImage(file,'tech@test.com')).id,image.id);
  assert.equal((await reportImage(image.id)).content_type,'image/png');
  const document={customer:{companyId:1,personId:'42',name:'Nome adulterado'},title:'Teste',serviceOrder:'14948',equipments:[{client:'ITUTEX',machine:'Compressor',components:[{name:'Motor',points:[{name:'01H',velocity:2,acceleration:'',peak:'',spectra:{velocity:{assetId:image.id,name:'spectrum.png'}}}]}]}]};
  const saved=await saveReport({document},'tech@test.com');
  assert.equal(saved.version,1);
  assert.equal(saved.customer.name,'ITUTEX');
  const link:any=(await query('SELECT customer_company_id,customer_person_id FROM web_vibration_reports')).rows[0];
  assert.equal(link.customer_company_id,1);assert.equal(String(link.customer_person_id),'42');
  await assert.rejects(saveReport({document:{...document,customer:null}},'tech@test.com'),/cliente cadastrado/);
  await assert.rejects(saveReport({document:{...document,customer:{companyId:1,personId:'999'}}},'tech@test.com'),/Cliente não encontrado/);

  assert.equal((await reportsList('ITUTEX',0)).reports.length,1);
  assert.equal((await reportsList('14948',0)).reports.length,1);
  const opened=await reportDetail(saved.id);
  assert.equal(opened.document.equipments[0].components[0].points[0].spectra.velocity.assetId,image.id);
  document.title='Revisado';
  const updated=await saveReport({id:saved.id,version:1,document},'reviewer@test.com');
  assert.equal(updated.version,2);
  await assert.rejects(saveReport({id:saved.id,version:1,document},'other@test.com'),ReportConflict);
  assert.equal((await reportsList('Revisado',0)).reports[0].updated_by,'reviewer@test.com');
  assert.equal((await query('SELECT * FROM web_vibration_report_image_links')).rows.length,1);
  document.equipments[0].components[0].points[0].spectra.velocity.assetId='10000000-0000-4000-8000-000000000000';
  await assert.rejects(saveReport({id:saved.id,version:2,document},'tech@test.com'),/espectro/);
  assert.equal((await reportDetail(saved.id)).version,2);
  assert.throws(()=>validateProject({equipments:[]}),/equipamentos/);
  await assert.rejects(saveImage(new File(['bad'],'fake.png',{type:'image/png'}),'tech@test.com'),/inválida/);
 }finally{g.historyPool=old;await db.close();}
});

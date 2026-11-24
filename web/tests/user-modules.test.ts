import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {userModules,canOpenPath,canParticipate,jobTitles} from '../lib/user-modules';
import {participantSql} from '../lib/user-module-sql';
import {setAccess} from '../lib/admin-store';
import {employeeFields} from '../lib/employees';
test('modules and jobs are independent; empty configuration revokes, null preserves legacy',()=>{
 const dual={enabled:true,job_title:'Técnico',job_titles:['Técnico','Vendedor'],modules:['portal-tecnico','visitas']};
 assert.ok(canParticipate(dual,'technician'));assert.ok(canParticipate(dual,'seller'));
 assert.equal(canParticipate({...dual,modules:['visitas']},'technician'),false);
 assert.equal(canParticipate({...dual,job_titles:['Técnico']},'seller'),false);
 assert.equal(canParticipate({...dual,enabled:false},'seller'),false);
 assert.deepEqual(userModules({...dual,modules:[]}),[]);
 assert.ok(userModules({role:'user',modules:null}).includes('portal-tecnico'));
 assert.equal(canOpenPath(dual.modules,'/api/field'),true);
 assert.equal(canOpenPath(dual.modules,'/api/visits/123'),true);
 for(const path of ['/programacao','/api/service-scheduling','/api/admin','/modulos/crm','/api/warehouse'])assert.equal(canOpenPath(dual.modules,path),false,path);
 assert.equal(canOpenPath([], '/api/session-access'),true);
 assert.deepEqual(jobTitles({job_title:'Técnico'}),['Técnico']);
});
test('multi-job profile persists atomically, qualifies on both maps, and rejects unknown permissions',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 try{
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated');
 for(const file of ['008_administration.sql','009_employees.sql','021_employee_task_color.sql','095_employee_deletion.sql','121_user_modules.sql','124_module_sections.sql'])await db.exec(readFileSync(new URL('../sql/'+file,import.meta.url),'utf8'));
 const query=db.query.bind(db);g.historyPool={query,connect:async()=>({query,release(){}})};
 const form={email:'dual@test.com',mode:'create',display_name:'Técnico e vendedor',department:'Serviços',job_titles:['Técnico','Vendedor'],modules:['portal-tecnico','visitas'],phone:'555180880512',role:'user',enabled:true,alert_preventive:false,alert_rental:false,alert_email:false,alert_whatsapp:false};
 await setAccess(form,{id:'admin',email:'guih.waltrick@gmail.com'});
 const rows=await db.query<any>(`SELECT u.*,${participantSql('technician','u')} technician,${participantSql('seller','u')} seller FROM web_user_access u WHERE email=$1`,[form.email]);
 assert.equal(rows.rows[0].technician,true);assert.equal(rows.rows[0].seller,true);assert.deepEqual(rows.rows[0].modules,form.modules);
 await setAccess({...form,mode:'update',modules:['visitas']},{id:'admin',email:'guih.waltrick@gmail.com'});
 assert.equal((await db.query<any>(`SELECT ${participantSql('technician')} yes FROM web_user_access WHERE email=$1`,[form.email])).rows[0].yes,false);
 await setAccess({...form,mode:'update',modules:['crm:projecao']},{id:'admin',email:'guih.waltrick@gmail.com'});
 assert.deepEqual((await db.query<any>('SELECT modules FROM web_user_access WHERE email=$1',[form.email])).rows[0].modules,['crm:projecao']);
 assert.throws(()=>employeeFields({...form,modules:['inventado']}),/Módulo inválido/);
 assert.throws(()=>employeeFields({...form,job_titles:'Técnico'}),/Seleção/);
 }finally{g.historyPool=old;await db.close();}
});

test('administrators retain administration independently of module selection',()=>{
 for(const modules of [null,[],['crm'],['crm','administracao']]){
  const access=userModules({role:'admin',enabled:true,modules});
  assert.equal(access.filter(id=>id==='administracao').length,1);
  for(const path of ['/administracao','/api/admin'])assert.ok(canOpenPath(access,path));
 }
 assert.deepEqual(userModules({role:'admin',enabled:false,modules:['administracao']}),[]);
 assert.equal(userModules({role:'user',enabled:true,modules:[]}).includes('administracao'),false);
});

test('migration upgrades legacy module constraints without losing selections and can run twice',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`CREATE TABLE web_user_access(email text PRIMARY KEY,modules jsonb NOT NULL DEFAULT '["crm"]',
 CONSTRAINT web_user_access_modules_valid CHECK(jsonb_typeof(modules)='array' AND modules <@ '["crm","tecnico","programacao"]'::jsonb));
 INSERT INTO web_user_access VALUES('legacy@test.com','["crm","tecnico"]');`);
 const sql=readFileSync(new URL('../sql/121_user_modules.sql',import.meta.url),'utf8');
 await db.exec(sql);await db.exec(sql);
 assert.deepEqual((await db.query<any>("SELECT modules FROM web_user_access")).rows[0].modules,['crm','tecnico']);
 await db.query("UPDATE web_user_access SET job_titles=$1,modules=$2",[JSON.stringify(['Técnico','Vendedor']),JSON.stringify(['portal-tecnico','visitas','administracao'])]);
 const row=(await db.query<any>("SELECT job_titles,modules FROM web_user_access")).rows[0];
 assert.deepEqual(row.job_titles,['Técnico','Vendedor']);assert.deepEqual(row.modules,['portal-tecnico','visitas','administracao']);
 await assert.rejects(db.query("UPDATE web_user_access SET modules='[\"invalid\"]'"));
 }finally{await db.close();}
});

test('visits management has an independent selectable permission',async()=>{
 const {canManageVisits}=await import('../lib/access-roles');
 assert.equal(canManageVisits({enabled:true,role:'user',modules:['gestao-visitas']}),true);
 assert.equal(canManageVisits({enabled:true,role:'admin',modules:['visitas']}),false);
 assert.equal(canManageVisits({enabled:false,role:'admin',modules:['gestao-visitas']}),false);
 assert.equal(canOpenPath(['visitas'],'/visitas/gestao'),false);
 assert.equal(canOpenPath(['gestao-visitas'],'/visitas/gestao'),true);
 assert.equal(canOpenPath(['gestao-visitas'],'/api/visits/management'),true);
});

test('configuration access is separate from administration',()=>{
 const config=userModules({role:'user',enabled:true,modules:['configuracoes']});
 for(const path of ['/configuracoes/cadastros','/modulos/configuracoes','/api/catalog-configuration','/api/registries/quote-types'])assert.ok(canOpenPath(config,path));
 for(const path of ['/administracao','/api/admin'])assert.equal(canOpenPath(config,path),false);
 assert.equal(canOpenPath(userModules({role:'admin',enabled:true,modules:[]}),'/configuracoes'),false);
});

test('selecting modules and sections preserves independent grants and blocks sibling routes',async()=>{
 const {toggleModule,toggleSection,sectionSelected,hasModuleAccess}=await import('../lib/module-sections');
 let selected=['visitas','crm'];
 selected=toggleSection(selected,'crm','crm:projecao');
 assert.equal(selected.includes('crm'),false);
 assert.equal(sectionSelected(selected,'crm','crm:projecao'),false);
 assert.equal(sectionSelected(selected,'crm','crm:evolucao'),true);
 assert.equal(selected.includes('visitas'),true);
 assert.equal(canOpenPath(selected,'/comercial/projecao'),false);
 assert.equal(canOpenPath(selected,'/api/sales-projection'),false);
 assert.equal(canOpenPath(selected,'/comercial/evolucao'),true);
 selected=toggleModule(selected,'crm');assert.deepEqual(selected,['visitas','crm']);
 selected=toggleModule(selected,'crm');assert.deepEqual(selected,['visitas']);
 selected=toggleSection(selected,'crm','crm:projecao');
 assert.equal(hasModuleAccess(selected,'crm'),true);
 assert.equal(canOpenPath(selected,'/modulos/crm'),true);
 assert.equal(canOpenPath(selected,'/comercial/projecao'),true);
 assert.equal(canOpenPath(selected,'/api/sales-projection'),true);
 assert.equal(canOpenPath(selected,'/crm'),false);
 assert.equal(canOpenPath(selected,'/api/crm'),false);
 assert.equal(canOpenPath(['crm:orcamentos'],'/orcamentos/novo'),false);
 assert.equal(canOpenPath(['configuracoes:cadastros'],'/configuracoes/cadastros/crm'),false);
 assert.equal(canOpenPath(['crm:catalogo'],'/fabricante'),true);
 assert.equal(canOpenPath(['equipamentos:locacao'],'/equipamentos/inspecoes'),false);
});

test('embedded calendars are accessible without granting the general calendar page',()=>{
 for(const module of ['visitas','gestao-visitas','portal-tecnico','tarefas']){
  assert.equal(canOpenPath([module],'/api/calendar'),true,module);
  assert.equal(canOpenPath([module],'/calendario'),false,module);
 }
 assert.equal(canOpenPath(['crm'],'/api/calendar'),false);
 assert.equal(canOpenPath([],'/api/calendar'),false);
 assert.equal(canOpenPath(['calendario'],'/api/calendar'),true);
});

test('standalone portal permissions expose their parent menu without granting sibling areas',async()=>{
 const {hasModuleAccess}=await import('../lib/module-sections');
 assert.equal(hasModuleAccess(['portal-tecnico'],'assistencia-tecnica'),true);
 assert.equal(canOpenPath(['portal-tecnico'],'/modulos/assistencia-tecnica'),true);
 assert.equal(canOpenPath(['portal-tecnico'],'/tecnico'),true);
 assert.equal(canOpenPath(['portal-tecnico'],'/programacao'),false);
 assert.equal(hasModuleAccess(['gestao-visitas'],'visitas'),true);
 assert.equal(canOpenPath(['gestao-visitas'],'/modulos/visitas'),true);
 assert.equal(canOpenPath(['gestao-visitas'],'/visitas/gestao'),true);
 assert.equal(hasModuleAccess([], 'visitas'),false);
});

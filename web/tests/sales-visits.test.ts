import {registerMachine,listMachines,saveMachineSettings,machineSettings} from '../lib/visits/machine-registration';
import {createCustomerContact,listCustomerContacts} from "../lib/visits/contacts";
import {createVisitTask} from "../lib/visits/tasks";
import {queueVisitAlert,claimVisitAlerts,acknowledgeVisitAlert} from "../lib/visits/alerts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { addMonths, visitHealth } from "../lib/visits/model";
import { restoreVisitCustomer, disqualifyVisitCustomer, visitsData, saveVisit, saveCustomerLocation, administerVisit } from "../lib/visits/store";
import { saveVisitMeter } from "../lib/visits/equipment";
import { saveVisitPurpose,visitSettings } from "../lib/visits/settings";
import { saveTerritory } from "../lib/tasks/territories";
test("visit recurrence uses calendar months, month ends and Brazil dates", () => {
  assert.equal(visitHealth(null, "2026-10-20"), "overdue");
  assert.equal(visitHealth("2026-05-20T12:00:00Z", "2026-10-19"), "current");
  assert.equal(visitHealth("2026-05-20T12:00:00Z", "2026-10-20"), "due");
  assert.equal(visitHealth("2026-04-20T12:00:00Z", "2026-10-20"), "overdue");
  assert.equal(addMonths("2026-08-31", 6), "2027-02-28");
  assert.equal(visitHealth("2026-04-21T01:00:00Z", "2026-10-20"), "overdue");
});
test("seller scope, lead isolation, completion, historical dates and idempotent save", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool;
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
    for (const file of [
      "008_administration",
      "009_employees",
      "013_task_territories",
      "014_task_territory_columns",
      "040_schedule_map",
      "046_field_locations",
      "052_sales_visits",
      "053_sales_customer_locations",
      "054_sales_visit_purposes",
    ]) {
      if (file === "046_field_locations") await db.exec("CREATE TABLE web_field_events(actor text,located_at timestamptz)");
      if (file === "040_schedule_map") {
        await db.exec(
          "CREATE TABLE web_service_schedules(id bigint PRIMARY KEY);",
        );
      }
      await db.exec(
        readFileSync(
          new URL("../sql/" + file + ".sql", import.meta.url),
          "utf8",
        ),
      );
    }
    for(const f of ["010_tasks","018_task_assignment_reason","011_task_kanban","012_manual_tasks","016_task_order_links","015_task_origin_rules","041_task_completion_notifications","042_restricted_tasks","024_task_stages","027_task_stage_assignment","017_task_reminders","023_task_reminder_recurrence","044_task_followers"])await db.exec(readFileSync(new URL("../sql/"+f+".sql",import.meta.url),"utf8"));
    await db.exec(readFileSync(new URL("../sql/071_visit_contacts_actions.sql",import.meta.url),"utf8"));
    await db.exec(readFileSync(new URL("../sql/072_visit_machine_registration.sql",import.meta.url),"utf8"));
    await db.exec(readFileSync(new URL("../sql/074_visit_disqualifications.sql",import.meta.url),"utf8"));
    for(const name of ["075_customer_registry","076_customer_seller"])await db.exec(readFileSync(new URL("../sql/"+name+".sql",import.meta.url),"utf8"));
    const query = async (sql: string, args?: any[]) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      return db.query(sql.replace("BEGIN READ WRITE", "BEGIN"), args);
    };
    g.historyPool = { query, connect: async () => ({ query, release() {} }) };
    await db.exec(`INSERT INTO web_user_access(email,display_name,job_title,updated_by) VALUES('a@test.com','Vendedor A','Vendedor','test'),('b@test.com','Vendedor B','Vendedor','test'),('tech@test.com','Técnico','Técnico','test');
 CREATE TABLE m8_customer_directory(company_id integer,person_id bigint,name text,document text,payload jsonb,collected_at timestamptz DEFAULT now());
 INSERT INTO m8_customer_directory(company_id,person_id,name,document,payload) VALUES(1,1,'Cliente A','1','{"municipioNome":"São José","ufSigla":"SC"}'),(1,2,'Cliente B','2','{"municipioNome":"Lages","ufSigla":"SC"}'),(1,3,'Sem território','3','{}'),(2,1,'Cliente A','1','{"municipioNome":"São José","ufSigla":"SC"}');`);
    await db.exec(`CREATE TABLE m8_equipment_catalog(equipment_id bigint PRIMARY KEY,name text,model text,serial text);
      CREATE TABLE web_equipment_settings(equipment_id bigint PRIMARY KEY,document jsonb,version integer);
      INSERT INTO m8_equipment_catalog VALUES(100,'Compressor','TPF100','SERIE100');
      CREATE TABLE m8_person_equipment(company_id integer,person_id bigint,equipment_id bigint,present boolean);
      INSERT INTO m8_person_equipment VALUES(2,1,100,true),(1,1,101,true),(1,2,102,true),(1,4,103,false);
      INSERT INTO m8_customer_directory(company_id,person_id,name,document,payload) VALUES
      (1,4,'Vínculo removido','4','{"municipioNome":"São José","ufSigla":"SC"}'),
      (1,5,'Sem máquinas','5','{"municipioNome":"São José","ufSigla":"SC"}');`);
    await saveTerritory(
      {
        action: "save",
        city: "São José",
        uf: "SC",
        assignee: "a@test.com",
        seller: "Texto antigo",
        seller_user: "a@test.com",
      },
      "admin@test.com",
    );
    await saveTerritory(
      {
        action: "save",
        city: "Lages",
        uf: "SC",
        assignee: "b@test.com",
        seller_user: "b@test.com",
      },
      "admin@test.com",
    );
    await db.exec("INSERT INTO web_field_locations(actor,latitude,longitude,accuracy,located_at) VALUES('a@test.com',-27,-50,10,now()),('b@test.com',-28,-51,10,now())");
    assert.deepEqual((await visitsData("a@test.com")).sellers.map((s: any) => s.id), ["a@test.com"]);
    await db.exec("INSERT INTO web_user_access(email,display_name,job_title,role,updated_by) VALUES('admin@test.com','Administrador','Gestor','admin','test') ON CONFLICT(email) DO UPDATE SET role='admin',enabled=true");
    assert.equal((await visitsData("admin@test.com")).sellers.length, 2);
    assert.equal((await visitsData("a@test.com")).customers.length, 1);
    const equipment = (await visitsData("a@test.com")).customers[0].equipment;
    assert.equal(equipment?.length, 2);
    assert.equal(equipment?.[0].serial, "SERIE100");
    assert.equal(equipment?.[1].name, "Equipamento");
    await saveCustomerLocation({customer_key:"m8:1",latitude:-27.5,longitude:-50.5,version:0},"a@test.com");
    assert.equal((await visitsData("a@test.com")).customers[0].latitude,-27.5);
    await assert.rejects(()=>saveCustomerLocation({customer_key:"m8:1",latitude:-28,longitude:-51,version:0},"a@test.com"),/alterada/);
    await saveCustomerLocation({customer_key:"m8:1",latitude:-28,longitude:-51,version:1},"b@test.com");
    await assert.rejects(()=>saveCustomerLocation({customer_key:"m8:1",latitude:90,longitude:-51,version:1},"a@test.com"),/válida/);

    await db.exec(`INSERT INTO web_equipment_settings VALUES(100,'{"meter":1234,"meterDate":"2026-01-01"}',1)`);
    assert.equal((await visitsData("a@test.com")).customers[0].equipment?.[0].meter,1234);
    const meterUser = {email:"a@test.com"} as any;
    await assert.rejects(() => saveVisitMeter({customer_key:"m8:1",equipment:"100",version:1,meter:1200},meterUser,true),/menor/);
    await assert.rejects(() => saveVisitMeter({customer_key:"m8:1",equipment:"100",version:1,meter:1200},{email:"admin@test.com"} as any,true),/menor/);

    await assert.rejects(() => saveVisitMeter({customer_key:"m8:2",equipment:"102",version:null,meter:2000},meterUser));
    await assert.rejects(() => saveVisitMeter({customer_key:"m8:1",equipment:"100",version:1,meter:1200},meterUser),/menor/);
    await assert.rejects(() => saveVisitMeter({customer_key:"m8:1",equipment:"100",version:null,meter:2000},meterUser),/atualizada/);
    await assert.rejects(() => saveVisitMeter({customer_key:"m8:1",equipment:"100",version:1,meter:-1},meterUser),/válido/);

    assert.equal(
      (await visitsData("a@test.com")).customers[0].health,
      "overdue",
    );
    assert.equal((await visitsData("tech@test.com")).customers.length,0);
    await db.exec(`INSERT INTO web_sales_visits(id,seller,customer_key,scheduled_at,status,completed_at,contact,phone,description,outcome) VALUES('99999999-9999-4999-8999-999999999999','tech@test.com','m8:1',now(),'completed',now(),'Contato','123','Visita técnica','Concluída')`);
    assert.equal((await visitsData("a@test.com")).customers[0].health, "overdue", "Visita técnica não regulariza a carteira do vendedor");
    assert.equal((await visitsData("admin@test.com", undefined, true)).customers.find(c => c.key === "m8:1")?.health, "overdue");
    await db.exec("DELETE FROM web_sales_visits WHERE id='99999999-9999-4999-8999-999999999999'");

    const body = {
      purpose_id: "1",
      action: "schedule",
      id: "11111111-1111-4111-8111-111111111111",
      customer_key: "m8:1",
      scheduled_at: "2026-10-01T10:00:00-03:00",
      contact: "Pessoa",
      phone: "49999999999",
      description: "Teste",
    };
    await assert.rejects(() => saveVisit({...body,customer_key:"m8:999"}, "a@test.com"));
    await assert.rejects(() => saveVisit({...body,purpose_id:"999"}, "a@test.com"));
    await assert.rejects(() => saveVisit({...body,purpose_id:""}, "a@test.com"));
    await saveVisit(body, "a@test.com");
    await saveVisit(body, "a@test.com");
    let d = await visitsData("a@test.com");
    assert.equal(d.visits.length, 1);
    assert.equal(d.customers[0].health, "overdue");
    await assert.rejects(() =>
      saveVisit(
        {
          action: "complete",
          id: body.id,
          version: 1,
          completed_at: new Date().toISOString(),
          outcome: "Registro",
        },
        "b@test.com",
      ),
    );
    await saveVisit(
      {
        action: "complete",
        id: body.id,
        version: 1,
        completed_at: new Date().toISOString(),
        outcome: "Cliente visitado",
      },
      "a@test.com",
    );
    d = await visitsData("a@test.com");
    assert.equal(d.customers[0].health, "current");
    assert.equal(d.visits[0].outcome, "Cliente visitado");
    await assert.rejects(() =>
      saveVisit({ action: "cancel", id: body.id, version: 1 }, "a@test.com"),
    );
    const lead = {
      ...body,
      id: "22222222-2222-4222-8222-222222222222",
      customer_key: "",
      lead: {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Novo cliente",
        location: {latitude:-27.8,longitude:-50.3},
        city: "Cidade",
        uf: "SC",
        address: "",
      },
    };
    await saveVisit(lead, "a@test.com");
    assert.equal((await visitsData("a@test.com")).customers.find(c=>c.lead)?.latitude,-27.8);
    assert.equal((await visitsData("a@test.com")).customers.length, 2);
    assert.equal((await visitsData("b@test.com")).customers.length, 1);
    assert.equal((await visitsData("a@test.com",undefined,true)).visits.length, 2);
    await db.exec(`INSERT INTO web_sales_visits(id,seller,customer_key,scheduled_at,contact,phone,description,status)
      VALUES('99999999-9999-4999-8999-999999999999','b@test.com','m8:2',now(),'Contato','49999999999','Visita B','scheduled')`);
    let management = await visitsData("admin@test.com",undefined,true);
    assert.equal(management.visits.length,3);
    assert.equal(management.customers.find(c=>c.key==='m8:2')?.seller_ids?.[0],'b@test.com');
    await db.exec("UPDATE web_user_access SET enabled=false WHERE email='b@test.com'; DELETE FROM web_task_territories WHERE seller_user='b@test.com'; UPDATE m8_person_equipment SET present=false WHERE person_id=2");
    await assert.rejects(()=>visitsData("b@test.com",undefined,true));
    management = await visitsData("a@test.com",undefined,true);
    assert.ok(management.visits.some((v:any)=>v.seller==='b@test.com'));
    assert.ok(management.customers.some(c=>c.key==='m8:2'));
    assert.equal(management.sellers.find((v:any)=>v.id==='b@test.com').enabled,false);

    await assert.rejects(() =>
      saveVisit(
        { ...lead, id: "44444444-4444-4444-8444-444444444444" },
        "b@test.com",
      ),
    );
    assert.equal(
      (
        await db.query<{ seller: string }>(
          "SELECT seller FROM web_task_territories WHERE seller_user=$1",
          ["a@test.com"],
        )
      ).rows[0].seller,
      "Texto antigo",
    );
    const purposes=await visitSettings("tech@test.com");
    assert.equal(purposes.length,10);
    await saveVisitPurpose({...purposes[0],name:"Prospecção atualizada",active:false},"tech@test.com");
    await assert.rejects(()=>saveVisitPurpose({...purposes[0],name:"Conflito"},"tech@test.com"),/alterado/);
    await assert.rejects(()=>saveVisit({...body,id:"77777777-7777-4777-8777-777777777777",customer_key:"m8:5"},"tech@test.com"),/ativa/);
    await assert.rejects(()=>saveVisitPurpose({purposes:[{...purposes[1],name:"Não deve salvar"},{...purposes[0],name:"Conflito antigo"}]},"tech@test.com"),/alterado/);
    assert.equal((await visitSettings("tech@test.com"))[1].name,purposes[1].name);
    const external={...body,id:"88888888-8888-4888-8888-888888888888",purpose_id:"2",customer_key:"m8:5"};
    await saveVisit(external,"tech@test.com");
    const tech=await visitsData("tech@test.com");
    assert.equal(tech.visits.length,1);
    assert.equal(tech.visits[0].purpose_name,"Apresentação Comercial");
    assert.equal(tech.customers[0].key,"m8:5");
    assert.equal(tech.customers[0].in_portfolio,false);
    await assert.rejects(()=>saveVisit({action:"cancel",id:external.id,version:1},"a@test.com"));
    await saveVisit({action:"cancel",id:external.id,version:1},"tech@test.com");
    const edit={...external,action:"admin_edit",version:2,contact:"Contato corrigido"};
    await assert.rejects(()=>administerVisit(edit,"missing@test.com"));
    await assert.rejects(()=>administerVisit({...edit,action:"admin_delete"},"missing@test.com"));
    await administerVisit(edit,"tech@test.com");
    assert.equal((await visitsData("tech@test.com")).visits[0].contact,"Contato corrigido");
    await assert.rejects(()=>administerVisit({...edit,action:"admin_delete"},"admin@test.com"),/alterada/);
    await administerVisit({...edit,version:3,action:"admin_delete"},"tech@test.com");
    assert.equal((await visitsData("tech@test.com")).visits.length,0);
    assert.equal((await db.query("SELECT * FROM web_access_events WHERE event='sales_visit_admin'")).rows.length,2);

    assert.equal((await visitsData("a@test.com")).customers.find(c=>c.lead)?.in_portfolio,false);
    const contact=await createCustomerContact("m8:1",{name:"Contato reutilizável",phone:"49999999999"},"a@test.com");
    assert.ok((await listCustomerContacts("m8:1","tech@test.com")).some(c=>c.id===contact.id));
    const linked={...body,id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",purpose_id:"2",contact_id:contact.id,contact:"Nome ignorado"};
    await saveVisit(linked,"a@test.com");
    assert.equal((await db.query<any>("SELECT contact FROM web_sales_visits WHERE id=$1",[linked.id])).rows[0].contact,"Contato reutilizável");
    await assert.rejects(()=>saveVisit({...linked,id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",customer_key:"m8:2"},"a@test.com"),/contato deste cliente/);
    await db.exec("UPDATE web_user_access SET phone='49999999999' WHERE email IN ('a@test.com','tech@test.com')");
    await assert.rejects(()=>queueVisitAlert({query},linked.id,"a@test.com","2020-01-01T12:00"),/futura/);
    await queueVisitAlert({query},linked.id,"a@test.com","2099-01-01T12:00");
    await queueVisitAlert({query},linked.id,"a@test.com","2099-01-01T12:00");
    assert.equal((await db.query("SELECT * FROM web_sales_visit_alerts")).rows.length,1);
    await db.exec("UPDATE web_sales_visit_alerts SET scheduled_at=now()-interval '1 minute'");
    const messages=await claimVisitAlerts("https://example.test");
    assert.equal(messages.length,1);assert.match(messages[0].text,/Contato reutilizável/);
    assert.equal((await claimVisitAlerts("https://example.test")).length,0);
    await assert.rejects(()=>acknowledgeVisitAlert(messages[0].id.slice(6),"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"));
    await acknowledgeVisitAlert(messages[0].id.slice(6),messages[0].token);
    const demand={visitId:linked.id,requestId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",title:"Demanda da visita",description:"Preparar proposta",assignedTo:"tech@test.com",priority:"high",dueDate:"2099-01-02"};
    const task=await createVisitTask(demand,{email:"a@test.com"} as any);
    assert.equal((await createVisitTask(demand,{email:"a@test.com"} as any)).taskId,task.taskId);
    const savedTask=(await db.query<any>("SELECT * FROM web_tasks WHERE id=$1",[task.taskId])).rows[0];
    assert.equal(savedTask.assigned_to,"tech@test.com");assert.deepEqual(savedTask.followers,["a@test.com"]);
    assert.deepEqual((await db.query<any>("SELECT followers FROM web_sales_visits WHERE id=$1",[linked.id])).rows[0].followers,["a@test.com"]);
    await queueVisitAlert({query},linked.id,"a@test.com","2099-02-01T12:00");
    await saveVisit({action:"cancel",id:linked.id,version:1},"a@test.com");
    assert.equal((await db.query<any>("SELECT count(*) n FROM web_sales_visit_alerts WHERE state='pending'")).rows[0].n,0);


    const registration={customer:'m8:5',requestId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',equipmentType:'Compressor',model:'GA22',brand:'Atlas Copco',serial:'ABC123',meter:'1234,5'};
    await assert.rejects(()=>registerMachine(registration,{email:'a@test.com'} as any),/Defina o responsável/);
    await assert.rejects(()=>saveMachineSettings('a@test.com','b@test.com'),/WhatsApp/);
    await saveMachineSettings('a@test.com','tech@test.com');
    assert.equal((await machineSettings('a@test.com')).equipmentAssignee,'tech@test.com');
    const machine=await registerMachine(registration,{email:'a@test.com'} as any);
    assert.equal((await registerMachine(registration,{email:'a@test.com'} as any)).taskId,machine.taskId);
    assert.equal((await listMachines('m8:5','tech@test.com')).length,1);
    assert.equal(Number((await listMachines('m8:5','tech@test.com'))[0].meter),1234.5);
    const machineTask=(await db.query<any>('SELECT * FROM web_tasks WHERE id=$1',[machine.taskId])).rows[0];
    assert.equal(machineTask.assigned_to,'tech@test.com');
    assert.equal(machineTask.customer,'Sem máquinas');
    assert.deepEqual(machineTask.followers,['a@test.com']);
    await assert.rejects(()=>registerMachine({...registration,meter:'-1'},{email:'a@test.com'} as any),/horímetro/);
    await assert.rejects(()=>registerMachine({...registration,customer:'m8:999'},{email:'a@test.com'} as any));
    await db.exec("UPDATE web_user_access SET enabled=false WHERE email='tech@test.com'");
    await assert.rejects(()=>registerMachine({...registration,requestId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'},{email:'a@test.com'} as any),/ativo/);
    assert.equal((await listMachines('m8:5','a@test.com')).length,1);

    await db.exec("UPDATE web_user_access SET enabled=true WHERE email='b@test.com'");
    await db.exec("UPDATE web_sales_visit_purposes SET active=true WHERE id=1");
    const delegated = {...body,id:"abababab-abab-4bab-8bab-abababababab",seller:"b@test.com"};
    await saveVisit(delegated,"a@test.com");
    assert.equal((await db.query<any>("SELECT seller FROM web_sales_visits WHERE id=$1",[delegated.id])).rows[0].seller,"b@test.com");
    assert.ok((await visitsData("b@test.com")).visits.some((v:any)=>v.id===delegated.id));
    assert.ok(!(await visitsData("a@test.com")).visits.some((v:any)=>v.id===delegated.id));
    const delegatedLead={...delegated,id:"acacacac-acac-4cac-8cac-acacacacacac",customer_key:"",lead:{id:"adadadad-adad-4dad-8dad-adadadadadad",name:"Lead SDR",city:"Lages",uf:"SC",address:"Rua A"}};
    await saveVisit(delegatedLead,"a@test.com");
    assert.equal((await db.query<any>("SELECT owner FROM web_sales_leads WHERE id=$1",[delegatedLead.lead.id])).rows[0].owner,"b@test.com");
    const audit=(await db.query<any>("SELECT actor,details FROM web_access_events WHERE event='sales_visit' AND details->>'id'=$1",[delegatedLead.id])).rows[0];
    assert.equal(audit.actor,"a@test.com");assert.equal(audit.details.seller,"b@test.com");
    await assert.rejects(()=>saveVisit({...delegated,seller:"tech@test.com"},"a@test.com"));
    await assert.rejects(()=>saveVisit({...delegated,seller:"missing@test.com"},"a@test.com"));
    const assignmentData=await visitsData("a@test.com",undefined,true);
    assert.ok(assignmentData.assignees.some((u:any)=>u.id==="b@test.com"));
    assert.ok(!assignmentData.assignees.some((u:any)=>u.id==="tech@test.com"));

    await assert.rejects(()=>disqualifyVisitCustomer({customer_key:"m8:1",reason:" "},"a@test.com"));
    await assert.rejects(()=>disqualifyVisitCustomer({customer_key:"m8:999",reason:"Fora do perfil"},"a@test.com"));
    await disqualifyVisitCustomer({customer_key:"m8:1",reason:"Fora do perfil"},"a@test.com");
    assert.equal((await visitsData("a@test.com")).customers.find(c=>c.key==="m8:1")?.disqualification?.reason,"Fora do perfil");
    await disqualifyVisitCustomer({customer_key:"lead:"+delegatedLead.lead.id,reason:"Sem interesse"},"b@test.com");
    assert.equal((await visitsData("b@test.com")).customers.find(c=>c.key==="lead:"+delegatedLead.lead.id)?.disqualification?.reason,"Sem interesse");

    await assert.rejects(()=>restoreVisitCustomer({customer_key:"m8:999"},"a@test.com"));
    await assert.rejects(()=>restoreVisitCustomer({customer_key:"lead:"+delegatedLead.lead.id},"a@test.com"));
    for(const [key,actor] of [["m8:1","a@test.com"],["lead:"+delegatedLead.lead.id,"b@test.com"]]){
      await restoreVisitCustomer({customer_key:key},actor);
      await restoreVisitCustomer({customer_key:key},actor);
      assert.equal((await visitsData(actor)).customers.find(c=>c.key===key)?.disqualification,undefined);
      const audit=(await db.query<any>("SELECT details FROM web_access_events WHERE event='sales_customer_restored' AND details->>'customer_key'=$1",[key])).rows;
      assert.equal(audit.length,1);assert.ok(audit[0].details.previous.reason);
    }

    await db.exec("INSERT INTO web_customer_registry(company_id,person_id,seller_user) VALUES(1,5,'b@test.com'),(1,1,'b@test.com')");
    const assigned=await visitsData('b@test.com');
    assert.deepEqual(assigned.customers.find(c=>c.key==='m8:5')?.seller_ids,['b@test.com']);
    assert.equal(assigned.customers.find(c=>c.key==='m8:5')?.in_portfolio,true,'directly assigned clients need no equipment');
    assert.equal((await visitsData('a@test.com')).customers.find(c=>c.key==='m8:1')?.in_portfolio,false,'city rule does not override explicit seller');
    await db.exec("UPDATE web_customer_registry SET seller_user=null WHERE person_id=1");
    assert.equal((await visitsData('a@test.com')).customers.find(c=>c.key==='m8:1')?.in_portfolio,true);

  } finally {
    g.historyPool = old;
    await db.close();
  }
});

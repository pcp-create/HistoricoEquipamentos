import {updateContactJob} from "../lib/visits/contact-job";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { saveJobType, listJobTypes } from "../lib/visits/job-types";
import { contactPayload, fetchM8Contacts } from "../lib/visits/m8-contacts";
import {
  createCustomerContact,
  listCustomerContacts,
} from "../lib/visits/contacts";
import { M8RequestError } from "../lib/service-orders/m8";
const input = {
  name: "Ana",
  phone: "49999070882",
  email: "ana@example.com",
  contact_type: "Financeiro",
  cargo_id: "7",
  job_type_id: "1",
  additional_phone: "4933334444",
  document: "12345678901",
  notes: "Compras",
};
test("contact contract requires ERP fields and paginates M8 responses", async () => {
  assert.equal(contactPayload(input).cargoId, 7);
  assert.equal(contactPayload(input).observacao, "Compras");
  for (const patch of [
    { email: "" },
    { cargo_id: "0" },
    { cargo_id: "1.2" },
    { contact_type: "Outro" },
    { additional_phone: "abc" },
    { document: "123" },
  ])
    assert.throws(() => contactPayload({ ...input, ...patch }));
  const paths: string[] = [];
  const rows = await fetchM8Contacts(async (path) => {
    paths.push(path);
    return paths.length === 1
      ? Array.from({ length: 1000 }, (_, id) => ({ id: id + 1 }))
      : [{ id: 1001 }];
  }, "10");
  assert.equal(rows.length, 1001);
  assert.match(paths[1], /Page=2&PageSize=1000/);
  await assert.rejects(() => fetchM8Contacts(async () => null, "10"));
});
test("M8 listing preserves local IDs, confirmed writes, uncertain writes and lead isolation", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool;
  try {
    await db.exec(`CREATE TABLE web_user_access(email text,enabled boolean,role text);INSERT INTO web_user_access VALUES('a@test.com',true,'user'),('blocked@test.com',false,'user');
   CREATE TABLE m8_customer_directory(person_id bigint,company_id int,name text DEFAULT 'Cliente');INSERT INTO m8_customer_directory(person_id,company_id) VALUES(10,1);
   CREATE TABLE web_sales_leads(id uuid,owner text);INSERT INTO web_sales_leads VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a@test.com');
   CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE web_customer_contacts(created_at timestamptz DEFAULT now(),id uuid PRIMARY KEY,customer_key text,name text,phone text,email text DEFAULT '',job_title text DEFAULT '',created_by text,UNIQUE(customer_key,name,phone));`);
    await db.exec(
      readFileSync(
        new URL("../sql/110_customer_contacts_m8.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        new URL("../sql/111_contact_job_types.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(readFileSync(new URL('../sql/112_contact_job_types_seed.sql',import.meta.url),'utf8').split('INSERT INTO')[0]+'COMMIT;');
    await db.exec(readFileSync(new URL('../sql/113_customer_contact_job_override.sql',import.meta.url),'utf8'));
    await db.exec(readFileSync(new URL('../sql/115_customer_contact_edits.sql',import.meta.url),'utf8'));
    await db.exec(`ALTER TABLE web_user_access ADD COLUMN phone text DEFAULT '49999999999';INSERT INTO web_user_access(email,enabled,role) VALUES('responsible@test.com',true,'user');CREATE TABLE web_visit_automation_settings(id boolean,equipment_assignee text);INSERT INTO web_visit_automation_settings VALUES(true,'responsible@test.com');CREATE TABLE web_tasks(id bigint GENERATED ALWAYS AS IDENTITY,origin text,customer text,description text,assigned_to text);`);
    const writeTask:any=async(body:any,_actor:any,transaction:any)=>({task:(await transaction.query('INSERT INTO web_tasks(description,assigned_to) VALUES($1,$2) RETURNING id',[body.description,body.assignedTo])).rows[0]});
    const query = async (sql: string, args?: any[]) => {
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      return db.query(sql, args);
    };
    g.historyPool = { query, connect: async () => ({ query, release() {} }) };
    const job = await saveJobType(
      { name: "Compras", m8_id: 7, active: true },
      "a@test.com",
    );
    assert.equal(job.id, "1");
    assert.equal((await listJobTypes("a@test.com")).length, 1);
    await assert.rejects(
      () =>
        saveJobType(
          { name: "Outro cargo", m8_id: 7, active: true },
          "a@test.com",
        ),
      /já está cadastrado/,
    );
    await assert.rejects(() =>
      saveJobType(
        { name: "Cargo", m8_id: 8, active: true },
        "blocked@test.com",
      ),
    );
    const disabled = await saveJobType(
      {
        id: job.id,
        version: job.version,
        name: "Compras",
        m8_id: 7,
        active: false,
      },
      "a@test.com",
    );
    assert.equal((await listJobTypes("a@test.com")).length, 0);
    await assert.rejects(
      () =>
        createCustomerContact("m8:10", input, "a@test.com", async () => {
          throw Error("Não deve enviar");
        }),
      /cargo ativo/,
    );
    await assert.rejects(
      () =>
        saveJobType(
          {
            id: job.id,
            version: job.version,
            name: "Compras",
            m8_id: 7,
            active: true,
          },
          "a@test.com",
        ),
      /alterado/,
    );
    await saveJobType(
      {
        id: job.id,
        version: disabled.version,
        name: "Compras",
        m8_id: 7,
        active: true,
      },
      "a@test.com",
    );
    let writes = 0,
      remote: any[] = [],
      fail = false;
    const session: any = async (company: number) => {
      assert.equal(company, 1);
      return async (path: string, body?: any) => {
        assert.match(path, /\/cliente\/10\/contato/);
        if (!body) return remote;
        writes++;
        assert.equal(body.cargoId, 7);
        assert.equal(body.tipo, "Geral");
        if (fail) throw new M8RequestError("Sem confirmação", true);
        remote = [
          {
            id: 42,
            nome: body.nome,
            telefone: body.telefone,
            email: body.email,
            cargoId: 7,
          },
        ];
        return { id: 42 };
      };
    };
    const saved = await createCustomerContact(
      "m8:10",
      { ...input, cargo_id: 999 },
      "a@test.com",
      session,
    );
    assert.equal(saved.m8_id, 42);
    assert.equal(writes, 1);
    assert.equal(
      (await createCustomerContact("m8:10", input, "a@test.com", session)).id,
      saved.id,
    );
    assert.equal(writes, 1);
    remote[0].nome = "Ana atualizada";
    const listed = await listCustomerContacts("m8:10", "a@test.com", session);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, saved.id);
    assert.equal(listed[0].name, "Ana atualizada");
    await assert.rejects(() =>
      listCustomerContacts("m8:10", "blocked@test.com", session),
    );
    fail = true;
    await assert.rejects(
      () =>
        createCustomerContact(
          "m8:10",
          { ...input, name: "Outro" },
          "a@test.com",
          session,
        ),
      /confirmação/,
    );
    assert.equal(writes, 2);
    await assert.rejects(
      () =>
        createCustomerContact(
          "m8:10",
          { ...input, name: "Outro" },
          "a@test.com",
          session,
        ),
      /confirmação/,
    );
    assert.equal(writes, 2);
    remote.push({
      id: 43,
      nome: "Outro",
      telefone: input.phone,
      email: input.email,
      cargoId: 7,
    });
    assert.equal(
      (await listCustomerContacts("m8:10", "a@test.com", session)).length,
      2,
    );
    await createCustomerContact(
      "m8:10",
      { ...input, name: "Outro" },
      "a@test.com",
      session,
    );
    assert.equal(writes, 2);
    remote.push({ ...remote[0], id: 44, email: "outro@example.com" });
    const duplicates = await listCustomerContacts(
      "m8:10",
      "a@test.com",
      session,
    );
    assert.equal(duplicates.length, 3);
    assert.equal(new Set(duplicates.map((c) => c.id)).size, 3);
    const duplicateId = duplicates.find((c) => String(c.m8_id) === "44")!.id;
    const repeated = await listCustomerContacts("m8:10", "a@test.com", session);
    assert.equal(
      repeated.find((c) => String(c.m8_id) === "44")!.id,
      duplicateId,
    );
    const alternate=await saveJobType({name:'Fiscal',m8_id:15,active:true},'a@test.com');
    const beforeWrites=writes;
    const updated=await updateContactJob({customer:'m8:10',contactId:saved.id,jobTypeId:alternate.id,version:1,name:'Ana Atualizada',phone:'49999887766',email:'nova@example.com',additional_phone:'4933221100',document:'12345678901',notes:'Dados atualizados'},'a@test.com',writeTask);
    assert.equal(updated.job_title,'Fiscal');assert.equal(updated.job_version,2);
    const task:any=(await query('SELECT * FROM web_tasks')).rows[0];assert.equal(task.assigned_to,'responsible@test.com');assert.match(task.description,/Ana Atualizada/);assert.match(task.description,/nova@example.com/);assert.match(task.description,/Solicitante: a@test.com/);assert.equal(task.origin,'Ajuste de contato · Visitas');
    await updateContactJob({customer:'m8:10',contactId:saved.id,jobTypeId:alternate.id,version:2,name:'Ana Atualizada'},'a@test.com',writeTask);assert.equal((await query('SELECT * FROM web_tasks')).rows.length,1);
    await assert.rejects(()=>updateContactJob({customer:'m8:10',contactId:saved.id,version:2,name:'Não deve salvar'},'a@test.com',async()=>{throw Error('Falha da tarefa')}),/Falha da tarefa/);
    assert.equal(((await query('SELECT job_version FROM web_customer_contacts WHERE id=$1',[saved.id])).rows[0] as any).job_version,2);

    await assert.rejects(()=>updateContactJob({customer:'m8:10',contactId:saved.id,jobTypeId:alternate.id,version:1},'a@test.com'),/alterado/);
    await assert.rejects(()=>updateContactJob({customer:'m8:10',contactId:saved.id,jobTypeId:alternate.id,version:2},'blocked@test.com'));
    const refreshed=(await listCustomerContacts('m8:10','a@test.com',session)).find(c=>c.id===saved.id)!;
    assert.equal(refreshed.name,'Ana Atualizada');assert.equal(refreshed.phone,'49999887766');assert.equal(refreshed.email,'nova@example.com');assert.equal(refreshed.notes,'Dados atualizados');assert.equal(refreshed.job_title,'Fiscal');assert.equal(refreshed.cargo_id,15);assert.equal(refreshed.job_version,2);assert.equal(writes,beforeWrites);
    const lead = await createCustomerContact(
      "lead:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      { name: "Lead", phone: input.phone },
      "a@test.com",
      async () => {
        throw Error("Não deve acessar ERP");
      },
    );
    assert.equal(
      (
        await listCustomerContacts(
          "lead:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          "a@test.com",
        )
      ).length,
      1,
    );
    assert.ok(lead.id);
  } finally {
    g.historyPool = old;
    await db.close();
  }
});

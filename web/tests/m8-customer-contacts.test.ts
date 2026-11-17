import { syncContact } from "../lib/visits/contact-sync";
import { updateContactJob } from "../lib/visits/contact-job";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { saveJobType, listJobTypes } from "../lib/visits/job-types";
import { contactPayload, fetchM8Contacts } from "../lib/visits/m8-contacts";
import {
  createCustomerContact,
  listCustomerContacts,
  refreshCustomerContacts,
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
  assert.equal(contactPayload({ ...input, email: "" }).email, "");
  assert.equal(contactPayload({ ...input, email: undefined }).email, "");
  assert.equal(contactPayload(input).observacao, "Compras");
  for (const patch of [
    { email: "invalido" },
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
    await db.exec(
      readFileSync(
        new URL("../sql/112_contact_job_types_seed.sql", import.meta.url),
        "utf8",
      ).split("INSERT INTO")[0] + "COMMIT;",
    );
    await db.exec(
      readFileSync(
        new URL(
          "../sql/113_customer_contact_job_override.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        new URL("../sql/115_customer_contact_edits.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        new URL("../sql/117_contact_sync_queue.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(readFileSync(new URL("../sql/118_contact_deletion.sql",import.meta.url),"utf8"));
    await db.exec(
      `ALTER TABLE web_user_access ADD COLUMN phone text DEFAULT '49999999999';INSERT INTO web_user_access(email,enabled,role) VALUES('responsible@test.com',true,'user');CREATE TABLE web_visit_automation_settings(id boolean,equipment_assignee text);INSERT INTO web_visit_automation_settings VALUES(true,'responsible@test.com');CREATE TABLE web_tasks(id bigint GENERATED ALWAYS AS IDENTITY,origin text,customer text,description text,assigned_to text);`,
    );
    const writeTask: any = async (
      body: any,
      _actor: any,
      transaction: any,
    ) => ({
      task: (
        await transaction.query(
          "INSERT INTO web_tasks(description,assigned_to) VALUES($1,$2) RETURNING id",
          [body.description, body.assignedTo],
        )
      ).rows[0],
    });
    const query = async (sql: string, args?: any[]) => {
      if (sql.includes("pg_try_advisory_lock"))
        return { rows: [{ locked: true }] };
      if (sql.includes("pg_advisory_unlock")) return { rows: [] };
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
      uncertain = false;
    const session: any = async () => async (_path: string, body?: any) => {
      if (!body) return remote;
      writes++;
      if (uncertain) throw new M8RequestError("Sem confirmação", true);
      remote.push({ ...body, id: 42 });
      return { id: 42 };
    };
    const saved = await createCustomerContact(
      "m8:10",
      { ...input, email: "" },
      "a@test.com",
      session,
    );
    assert.equal(writes, 0);
    assert.equal(saved.sync_requested, true);
    assert.equal((await listCustomerContacts("m8:10", "a@test.com")).length, 1);
    await syncContact(saved.id, "a@test.com", session);
    assert.equal(writes, 0);
    assert.match(
      (await listCustomerContacts("m8:10", "a@test.com"))[0].sync_error,
      /exige e-mail/,
    );
    const updated = await updateContactJob(
      {
        customer: "m8:10",
        contactId: saved.id,
        version: 1,
        email: input.email,
      },
      "a@test.com",
    );
    assert.equal(updated.job_version, 2);
    await syncContact(saved.id, "a@test.com", session);
    let listed = await listCustomerContacts("m8:10", "a@test.com");
    assert.equal(writes, 1);
    assert.equal(listed[0].m8_id, 42);
    assert.equal(listed[0].sync_requested, false);
    await updateContactJob(
      {
        customer: "m8:10",
        contactId: saved.id,
        version: 2,
        name: "Ana editada",
      },
      "a@test.com",
    );
    await syncContact(saved.id, "a@test.com", session);
    assert.equal(writes, 1);
    await refreshCustomerContacts("m8:10", "a@test.com", session);
    listed = await listCustomerContacts("m8:10", "a@test.com");
    assert.equal(listed[0].name, "Ana editada");
    assert.equal(listed[0].sync_requested, true);
    assert.match(listed[0].sync_error, /não oferece edição/);
    remote[0].nome = "Ana editada";
    await syncContact(saved.id, "a@test.com", session);
    assert.equal(
      (await listCustomerContacts("m8:10", "a@test.com"))[0].sync_requested,
      false,
    );
    uncertain = true;
    const other = await createCustomerContact(
      "m8:10",
      { ...input, name: "Outro" },
      "a@test.com",
      session,
    );
    await syncContact(other.id, "a@test.com", session);
    assert.equal(writes, 2);
    await syncContact(other.id, "a@test.com", session);
    assert.equal(writes, 2);
    assert.equal((await listCustomerContacts("m8:10", "a@test.com")).length, 2);
    remote.push({
      ...contactPayload({ ...input, name: "Outro", contact_type: "Geral" }),
      id: 43,
    });
    await syncContact(other.id, "a@test.com", session);
    assert.equal(writes, 2);
    assert.equal(
      (await listCustomerContacts("m8:10", "a@test.com")).find(
        (x) => x.id === other.id,
      )?.sync_requested,
      false,
    );
    await assert.rejects(() =>
      listCustomerContacts("m8:10", "blocked@test.com"),
    );
    await assert.rejects(
      () =>
        updateContactJob(
          { customer: "m8:10", contactId: saved.id, version: 1, name: "stale" },
          "a@test.com",
        ),
      /alterado/,
    );
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
    const {deleteCustomerContact}=await import("../lib/visits/contact-delete");
    const current=(await listCustomerContacts("m8:10","a@test.com")).find(x=>x.id===saved.id)!;
    await assert.rejects(()=>deleteCustomerContact({customer:"m8:10",contactId:saved.id,version:current.job_version},"blocked@test.com"));
    await assert.rejects(()=>deleteCustomerContact({customer:"m8:10",contactId:saved.id,version:current.job_version+1},"a@test.com"),/alterado/);
    await deleteCustomerContact({customer:"m8:10",contactId:saved.id,version:current.job_version},"a@test.com");
    assert.equal((await listCustomerContacts("m8:10","a@test.com")).some(x=>x.id===saved.id),false);
    await refreshCustomerContacts("m8:10","a@test.com",session);
    assert.equal((await listCustomerContacts("m8:10","a@test.com")).some(x=>x.id===saved.id),false);
    const pending=await createCustomerContact("m8:10",{...input,name:"Pendente excluído"},"a@test.com",session);
    await deleteCustomerContact({customer:"m8:10",contactId:pending.id,version:pending.job_version},"a@test.com");
    const before=writes;
    await syncContact(pending.id,"a@test.com",session);
    await syncContact(saved.id,"a@test.com",session);
    assert.equal(writes,before);
    const restored=await createCustomerContact("m8:10",input,"a@test.com",session);
    assert.equal(restored.id,saved.id);
    assert.equal(restored.deleted_at,null);
    await deleteCustomerContact({customer:"m8:10",contactId:restored.id,version:restored.job_version},"a@test.com");
    assert.ok((await db.query<{deleted_at:string|null}>("SELECT deleted_at FROM web_customer_contacts WHERE id=$1",[saved.id])).rows[0].deleted_at);

  } finally {
    g.historyPool = old;
    await db.close();
  }
});

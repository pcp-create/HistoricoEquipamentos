import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  identity,
  relate,
  type EquipmentIdentity,
  type OrderIdentity,
} from "../src/equipment/rules.js";
import {
  equipmentRows,
  personRows,
  collectEquipmentCatalog,
  syncEquipmentPeople,
} from "../src/sync/equipmentRegistry.js";
import { rebuildEquipmentLinks } from "../src/equipment/linker.js";
const equipment: EquipmentIdentity = {
  equipment_id: "10",
  name: "Compressor GA15",
  model: "GA15",
  serial: "BRP123456",
  serial_source: "nome",
  people: ["7"],
};
const order: OrderIdentity = {
  order_id: "1",
  client_id: "7",
  explicit_ids: [],
  serials: [],
  model: null,
  texts: [],
};
test("registry extracts labelled serials, rejects placeholders and flags ambiguity", () => {
  assert.equal(
    identity({ nome: "GA 15 VSD+ - SÉRIE BRP123456" }).serial,
    "BRP123456",
  );
  assert.equal(
    identity({ nome: "GA 15 VSD+ - SÉRIE BRP123456" }).model,
    "GA15VSD+",
  );
  assert.equal(identity({ nome: "GA15 SÉRIE BRP 123456" }).serial, "BRP123456");
  for (const nome of [
    "SÉRIE NC",
    "FALTA SÉRIE",
    "SÉRIE N/C",
    "SÉRIE 000000",
    "GA15 380V",
  ])
    assert.equal(identity({ nome }).serial, null);
  assert.equal(
    identity({ nome: "SÉRIE ABC123456 / SÉRIE DEF123456" }).serial,
    null,
  );
  assert.equal(
    identity({ nome: "SÉRIE ABC123456", numeroSerie: "XYZ9999" }).serial_source,
    "campo",
  );
});
test("link rules preserve boundaries, ownership, ambiguity, negation and evidence", () => {
  const linked = (text: string, eqs = [equipment]) =>
    relate({ ...order, texts: [{ field: "observacao", text }] }, eqs);
  assert.equal(linked("Revisar série BRP-123456")[0]?.method, "observation");
  assert.equal(linked("Revisar XBRP123456").length, 0);
  assert.equal(linked("Revisar BRP1234567").length, 0);
  assert.equal(linked("Não utilizar BRP123456")[0]?.method, "review");
  assert.equal(
    linked("BRP123456", [
      equipment,
      { ...equipment, equipment_id: "11" },
    ]).every((l) => l.method === "review"),
    true,
  );
  assert.equal(
    relate(
      {
        ...order,
        client_id: "8",
        texts: [{ field: "obs", text: "BRP123456" }],
      },
      [equipment],
    ).length,
    0,
  );
  assert.equal(linked("GA15")[0]?.method, "review");
  assert.equal(
    linked("NF 12345678", [{ ...equipment, serial: "12345678" }]).length,
    0,
  );
  assert.equal(
    linked("Série: 12345678", [{ ...equipment, serial: "12345678" }])[0]
      ?.method,
    "observation",
  );
  assert.equal(
    relate({ ...order, explicit_ids: ["10"] }, [equipment])[0]?.method,
    "explicit",
  );
  assert.equal(
    relate({ ...order, serials: ["BRP123456"] }, [equipment])[0]?.method,
    "serial",
  );
});
test("equipment import is canonical in company 1; per-person snapshots reconcile and links become stale on source edits", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated");
    for (const n of readdirSync(
      new URL("../supabase/migrations/", import.meta.url),
    )
      .filter((n) => n.endsWith(".sql"))
      .sort())
      await db.exec(
        readFileSync(
          new URL("../supabase/migrations/" + n, import.meta.url),
          "utf8",
        ),
      );
    const eq = { id: 10, nome: "GA15 - SÉRIE BRP123456" };
    await collectEquipmentCatalog(
      { company: 1, get: async () => ({ data: [eq] }) },
      db,
    );
    await assert.rejects(() =>
      collectEquipmentCatalog(
        { company: 2, get: async () => ({ data: [eq] }) },
        db,
      ),
    );
    assert.throws(() =>
      equipmentRows({ data: [eq, { ...eq, nome: "Divergente" }] }),
    );
    assert.throws(() =>
      personRows({ data: [{ id: 1, pessoaId: 8, equipamentoId: 10 }] }, "7"),
    );
    await db.exec(
      "INSERT INTO m8_ordens_servico(company_id,id_m8,cliente_id,observacao,payload) VALUES(2,1,7,'Revisar série BRP123456','{}')",
    );
    const calls: string[] = [];
    const fake = {
      company: 2,
      get: async (path: string) => {
        calls.push(path);
        if (path === "/v1/configuracoes/cliente")
          return { data: [{ id: 0 }, { id: 7, razaoSocial: "Cliente" }] };
        return {
          data: [
            { id: 1, pessoaId: 7, equipamentoId: 10, pessoaNome: "Cliente" },
          ],
        };
      },
    };
    await syncEquipmentPeople(fake, db, { maxPeople: 1 });
    assert(calls.includes("/v1/estoque/equipamento/pessoa/7"));
    assert.equal(
      (await db.query("SELECT * FROM m8_equipment_person_queue")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("SELECT * FROM m8_equipment_linked WHERE company_id=2"))
        .rows.length,
      1,
    );
    await db.exec(
      "UPDATE m8_ordens_servico SET observacao='Sem identificação' WHERE company_id=2 AND id_m8=1",
    );
    assert.equal(
      (await db.query("SELECT * FROM m8_equipment_linked")).rows.length,
      0,
    );
    await rebuildEquipmentLinks(db, 2);
    assert.equal(
      (await db.query("SELECT * FROM m8_order_equipment_links")).rows.length,
      0,
    );
    await db.exec("UPDATE m8_equipment_person_queue SET next_at=now()");
    await syncEquipmentPeople(
      {
        ...fake,
        get: async (path: string) =>
          path === "/v1/configuracoes/cliente"
            ? { data: [{ id: 7 }] }
            : { data: [] },
      },
      db,
      { maxPeople: 1 },
    );
    assert.equal(
      (await db.query("SELECT * FROM m8_person_equipment WHERE present")).rows
        .length,
      0,
    );
  } finally {
    await db.close();
  }
});

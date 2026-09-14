import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { catalogProductCodesSql } from "../lib/manufacturer/direct-products";
test("internal product links are separate from OEM references and survive index refresh", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE manufacturer_product_codes(code text,company_id bigint,product_id bigint,field text);
 CREATE TABLE m8_product_catalog(company_id bigint,product_id bigint);
 INSERT INTO m8_product_catalog VALUES(1,22260),(2,22260),(1,99);
 INSERT INTO manufacturer_product_codes VALUES('22260',1,99,'referenciaFabricante');`);
    const result = await db.query(
      `SELECT product_id::text,field FROM ${catalogProductCodesSql} x WHERE code=$1`,
      ["M8:22260"],
    );
    assert.equal(result.rows.length, 2);
    assert.ok(
      result.rows.every(
        (r: any) => r.product_id === "22260" && r.field === "codigoM8",
      ),
    );
    await db.exec("DELETE FROM manufacturer_product_codes");
    const after = await db.query(
      `SELECT * FROM ${catalogProductCodesSql} x WHERE code=$1`,
      ["M8:22260"],
    );
    assert.equal(after.rows.length, 2);
  } finally {
    await db.close();
  }
});

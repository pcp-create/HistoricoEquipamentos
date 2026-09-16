import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRentalStatus } from "../lib/equipment-management/rental-status";
const order = (tipo_id: number, status = "Pendente", id = "100") => ({
  id,
  company_id: 1,
  status,
  tipo_id,
});
test("rental status uses newest pending commitment before sale and defaults to available", () => {
  assert.equal(resolveRentalStatus([]).key, "available");
  for (const [type, key] of [
    [8, "rented"],
    [45, "loaned"],
    [24, "reserved"],
  ] as const)
    assert.equal(resolveRentalStatus([order(type)]).key, key);
  assert.equal(
    resolveRentalStatus([order(45), order(8, "Pendente", "99")]).key,
    "loaned",
  );
  assert.equal(resolveRentalStatus([order(24, "Processado")], 0).key, "sold");
  assert.equal(
    resolveRentalStatus([order(1, "Processado"), order(24, "Processado", "99")])
      .key,
    "available",
  );
  assert.equal(
    resolveRentalStatus([order(24, "Processado"), order(8, "Pendente", "99")])
      .key,
    "rented",
  );
});

test("completed sale requires confirmed zero total stock; repurchased machines are available", () => {
  for (const stock of [1, 2, null, NaN]) {
    assert.equal(
      resolveRentalStatus([order(24, "Processado")], stock).key,
      "available",
    );
  }
  assert.equal(resolveRentalStatus([order(24, "Processado")], 0).key, "sold");
  assert.equal(
    resolveRentalStatus([order(8), order(24, "Processado", "99")], 0).key,
    "rented",
  );
});

test("customer follows the order determining status, not another sale or commitment", () => {
  const sale = {
    ...order(24, "Processado", "101"),
    cliente_nome: "Cliente venda",
  };
  const pending = { ...order(8), cliente_nome: "Cliente locação" };
  assert.equal(
    resolveRentalStatus([sale, pending], 0).customer,
    "Cliente locação",
  );
  assert.equal(resolveRentalStatus([sale], 0).customer, "Cliente venda");
  assert.equal(resolveRentalStatus([sale], 1).customer, null);
  for (const type of [45, 24])
    assert.equal(
      resolveRentalStatus([{ ...order(type), cliente_nome: "Cliente OS" }])
        .customer,
      "Cliente OS",
    );
  assert.equal(resolveRentalStatus([order(8)]).customer, null);
});

test("any other pending order type reserves equipment; most recent pending still wins", () => {
  for (const type of [1, 24, 99])
    assert.equal(resolveRentalStatus([order(type)]).key, "reserved");
  assert.equal(
    resolveRentalStatus([order(1), order(8, "Pendente", "99")]).key,
    "reserved",
  );
  assert.equal(
    resolveRentalStatus([order(45), order(1, "Pendente", "99")]).key,
    "loaned",
  );
  assert.equal(
    resolveRentalStatus([order(1, "Processado")], 0).key,
    "unavailable",
  );
});

test("uncommitted machines require positive stock; excess stock is flagged without changing availability", () => {
  for (const stock of [0, -1, -2]) {
    const result = resolveRentalStatus([], stock);
    assert.equal(result.key, "unavailable");
    assert.ok(result.stockNote?.includes(String(stock)));
  }
  assert.equal(resolveRentalStatus([], 1).stockNote, undefined);
  assert.equal(resolveRentalStatus([], 2).key, "available");
  assert.match(resolveRentalStatus([], 2).stockNote!, /acima de 1/);
  assert.equal(resolveRentalStatus([], null).key, "available");
  assert.equal(resolveRentalStatus([], null).stockNote, undefined);
  assert.equal(resolveRentalStatus([order(24, "Processado")], 0).key, "sold");
  for (const [type, key] of [
    [8, "rented"],
    [45, "loaned"],
    [24, "reserved"],
  ] as const)
    assert.equal(resolveRentalStatus([order(type)], -1).key, key);
});

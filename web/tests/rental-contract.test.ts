import { test } from "node:test";
import assert from "node:assert/strict";
import { rentalContract } from "../lib/equipment-management/contract";
import { resolveRentalStatus } from "../lib/equipment-management/rental-status";
test("contract periods use calendar days, 30-day boundary and expiry after end date", () => {
  const current = rentalContract("2026-09-01", "2026-10-16", "2026-09-16");
  assert.equal(current.duration, 45);
  assert.equal(current.remaining, 30);
  assert.equal(current.key, "current");
  assert.equal(
    rentalContract("2026-09-01", "2026-10-15", "2026-09-16").key,
    "soon",
  );
  assert.equal(
    rentalContract("2026-09-01", "2026-09-16", "2026-09-16").remaining,
    0,
  );
  assert.equal(
    rentalContract("2026-09-01", "2026-09-15", "2026-09-16").key,
    "overdue",
  );
  assert.equal(
    rentalContract(null, "2026-09-15", "2026-09-16").key,
    "incomplete",
  );
  assert.equal(
    rentalContract("2026-09-20", "2026-09-15", "2026-09-16").duration,
    null,
  );
});
test("contract belongs only to the pending rental or loan determining status", () => {
  const row = {
    id: "100",
    company_id: 1,
    status: "Pendente",
    tipo_id: 8,
    contract_start: "2026-09-01",
    contract_end: "2026-10-16",
  };
  assert.equal(resolveRentalStatus([row]).contract?.start, "2026-09-01");
  assert.equal(
    resolveRentalStatus([{ ...row, tipo_id: 45 }]).contract?.end,
    "2026-10-16",
  );
  assert.equal(
    resolveRentalStatus([{ ...row, tipo_id: 24 }, row]).contract,
    undefined,
  );
  assert.equal(
    resolveRentalStatus([{ ...row, status: "Processado" }]).contract,
    undefined,
  );
});

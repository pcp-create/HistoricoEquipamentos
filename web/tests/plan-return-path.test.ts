import { test } from "node:test";
import assert from "node:assert/strict";
import { planReturnPath } from "../lib/plan-return-path";
test("login preserves plan/quote targets and rejects external redirects", () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  assert.equal(
    planReturnPath(`/equipamentos?equipment=100&plan=${id}`),
    `/equipamentos?equipment=100&plan=${id}`,
  );
  assert.equal(planReturnPath(`/orcamentos?id=${id}`), `/orcamentos?id=${id}`);
  assert.equal(
    planReturnPath(`/orcamentos/novo?id=${id}`),
    `/orcamentos/novo?id=${id}`,
  );
  assert.equal(
    planReturnPath(
      "/OrdemServico/editar?empresa=2&id=800&next=https://evil.test",
    ),
    "/OrdemServico/editar?empresa=2&id=800",
  );
  assert.equal(
    planReturnPath("/OrdemServico/editar?empresa=3&id=800"),
    "/historico",
  );
  for (const unsafe of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "javascript:alert(1)",
    "/login?next=x",
    null,
  ])
    assert.equal(planReturnPath(unsafe), "/");
  assert.equal(
    planReturnPath("/equipamentos?equipment=invalid&x=secret"),
    "/equipamentos",
  );
});

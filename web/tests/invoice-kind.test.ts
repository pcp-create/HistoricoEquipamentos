import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceKind } from "../lib/sales-projection/invoice-kind";
const session =
  (products: unknown, services: unknown) => async (company: number) => {
    assert.equal(company, 1);
    return async (path: string, body?: unknown) => {
      assert.equal(body, undefined);
      assert.match(
        path,
        /notafiscalvenda\/50099\/(produto|servico)\?Page=1&PageSize=1000/,
      );
      return path.includes("/produto?") ? products : services;
    };
  };
test("classifies products, services, mixed and no active items using both collections", async () => {
  assert.equal(
    await invoiceKind(1, "50099", session([{ id: 1 }], [])),
    "Peças",
  );
  assert.equal(
    await invoiceKind(1, "50099", session([], [{ id: 2 }])),
    "Serviços",
  );
  assert.equal(
    await invoiceKind(1, "50099", session([{ id: 1 }], [{ id: 2 }])),
    "Peças e serviços",
  );
  assert.equal(
    await invoiceKind(1, "50099", session([{ id: 1, estaExcluido: true }], [])),
    "Não identificado",
  );
});
test("malformed or failed responses never become a guessed type", async () => {
  await assert.rejects(() =>
    invoiceKind(1, "50099", session({ data: [] }, [{ id: 2 }])),
  );
  await assert.rejects(() =>
    invoiceKind(1, "50099", async () => async () => {
      throw Error("Unavailable");
    }),
  );
  await assert.rejects(() => invoiceKind(24571, "50099", session([], [])));
  await assert.rejects(() => invoiceKind(1, "../50099", session([], [])));
});
test("continues pagination when the first page only contains deleted items", async () => {
  const pages: string[] = [];
  const result = await invoiceKind(
    1,
    "50099",
    async () => async (path: string) => {
      pages.push(path);
      if (path.includes("/servico?")) return [];
      if (path.includes("Page=1&"))
        return Array.from({ length: 1000 }, (_, i) => ({
          id: i + 1,
          estaExcluido: true,
        }));
      return [{ id: 1001 }];
    },
  );
  assert.equal(result, "Peças");
  assert.ok(pages.some((p) => p.includes("Page=2&")));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createdOrderDetail } from "../lib/service-orders/created-order-detail";
test("completed creation reads exact company and ID from M8 before local import", async () => {
  const g = globalThis as any,
    pool = g.historyPool,
    oldFetch = fetch,
    env = { ...process.env };
  try {
    let complete = false,
      calls = 0;
    g.historyPool = {
      query: async (_sql: string, args: any[]) => {
        assert.deepEqual(args, ["2", "800"]);
        return { rows: complete ? [{}] : [] };
      },
    };
    Object.assign(process.env, {
      M8_TENANT: "test",
      M8_USERNAME: "test",
      M8_PASSWORD: "test",
    });
    let wrong = false;
    globalThis.fetch = async (url, init) => {
      calls++;
      if (String(url).endsWith("/auth/token")) {
        assert.equal(JSON.parse(String(init?.body)).company, 2);
        return Response.json({ data: { token: "fake" } });
      }
      assert.equal(init?.method, "GET");
      assert.ok(
        String(url).endsWith("ordemservicocompleta?Id=800&Page=1&PageSize=1"),
      );
      return Response.json({
        data: [
          {
            id: wrong ? 801 : 800,
            numeroSequencia: 15099,
            clienteNome: "Cliente",
            produtos: [{ id: 1, produtoId: 50, quantidade: 2 }],
            servicos: [{ id: 2, servicoId: 60 }],
            equipamentoProduto: { id: 3 },
          },
        ],
      });
    };
    assert.equal(await createdOrderDetail("2", "800"), null);
    assert.equal(calls, 0);
    complete = true;
    const result = await createdOrderDetail("2", "800");
    assert.equal(result?.order.numero_sequencia, 15099);
    assert.equal(result?.order.id_m8, "800");
    assert.equal(result?.materials[0].produto_id, 50);
    assert.equal(result?.services[0].servico_id, 60);
    assert.equal(result?.equipment.length, 1);
    wrong = true;
    await assert.rejects(() => createdOrderDetail("2", "800"));
  } finally {
    g.historyPool = pool;
    globalThis.fetch = oldFetch;
    process.env = env;
  }
});

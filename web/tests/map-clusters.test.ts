import { test } from "node:test";
import assert from "node:assert/strict";
import { clusterMapPoints } from "../lib/service-scheduling/map-clusters";
test("zoom merges nearby OSs, separates distinct locations and keeps identical points together", () => {
  const orders = [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 0, y: 0 },
    { id: 3, x: 20, y: 0 },
    { id: 4, x: 300, y: 0 },
  ];
  const wide = clusterMapPoints(orders, (p) => p, 52);
  assert.deepEqual(
    wide.map((g) => g.items.map((i) => i.id)),
    [[1, 2, 3], [4]],
  );
  const near = clusterMapPoints(
    orders,
    (p) => ({ x: p.x * 8, y: p.y * 8 }),
    52,
  );
  assert.deepEqual(
    near.map((g) => g.items.map((i) => i.id)),
    [[1, 2], [3], [4]],
  );
  assert.deepEqual(
    clusterMapPoints(orders, (p) => p, 0).map((g) => g.items.length),
    [2, 1, 1],
  );
  assert.equal(
    wide.reduce((n, g) => n + g.items.length, 0),
    orders.length,
  );
});

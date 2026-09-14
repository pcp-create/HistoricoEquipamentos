import { test } from "node:test";
import assert from "node:assert/strict";
import { versionLabel } from "../lib/manufacturer/version-label";
test("version labels keep full name and compact conditions on one line", () => {
  assert.equal(
    versionLabel({ name: "GA 90", header: ["GA 90", "GA 90 – 160.xxx"] }),
    "GA 90 — GA 90 – 160.xxx",
  );
  assert.equal(
    versionLabel({
      name: "W800",
      header: ["W800", "Aplicação somente por modelo", "Longa descrição"],
    }),
    "W800 — Aplicação por modelo · sem restrição de série",
  );
  const label = versionLabel({
    name: "Versão",
    header: ["x".repeat(300) + "\nDetalhes"],
  });
  assert.ok(label.endsWith("…"));
  assert.ok(!label.includes("\n"));
  assert.ok(label.length < 120);
});

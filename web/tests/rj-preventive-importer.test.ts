import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseRjPreventive } from "../lib/manufacturer/rj-preventive-importer";
const filename = "Mnt. Prev. Linha ROTOR - 10 - Padrão RJ.xlsx";
function fixture(change?: (s: XLSX.WorkSheet) => void) {
  const rows: any[][] = Array.from({ length: 27 }, () => []);
  rows[2] = ["TABELA DE REVISÕES PERIÓDICAS ROTOR 10"];
  rows[3] = [
    "COMPONENTE",
    "Código METALPLAN",
    "VALOR",
    "QTD",
    "2000, 6000, 10000, 14000 e 18000",
    "",
    "4000 e 12000",
    "",
    "8000 e 16000",
    "",
    "20000",
    "",
  ];
  for (let i = 4; i < 23; i++)
    rows[i] = [
      "Peça " + i,
      "3120224",
      100,
      1,
      "",
      "",
      "",
      "X",
      "",
      "X",
      "",
      "",
    ];
  rows[5] = [
    "Filtro de admissão",
    "3120272+3120295",
    200,
    2,
    200,
    "X",
    200,
    "X",
    200,
    "X",
    200,
    "X",
  ];
  rows[6] = ["Coalescente", "EF 0300/M40", 300, 1, "", "", "", "X"];
  rows[8] = ["Separador após a série 57...", "3120234", "", ""];
  rows[9] = [
    "Lubrificante (TROCA)",
    "3020411",
    180,
    5,
    "",
    "",
    900,
    "X",
    "",
    "",
    900,
    "x",
  ];
  rows[17] = [
    "Revisão da unidade Compressora",
    "",
    4800,
    1,
    "",
    "",
    "",
    "",
    "",
    "",
    4800,
    "X",
  ];
  rows[23] = ["Total por revisão (R$):"];
  rows[25] = ["Obs.: Revisão da unidade a cada 20 mil horas."];
  const s = XLSX.utils.aoa_to_sheet(rows);
  change?.(s);
  const b = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(b, s, "ROTOR 10");
  return XLSX.write(b, { type: "buffer", bookType: "xlsx" });
}
test("RJ matrix preserves exact X schedules, quantities, combined references and missing data", () => {
  const bytes = fixture(),
    data = parseRjPreventive(bytes, filename);
  assert.equal(data.entries.length, 20);
  assert.equal(data.report.sourceRows, 19);
  const oil = data.entries.find(
    (e) => e.description === "Lubrificante (TROCA)",
  )!;
  assert.equal(
    oil.interval_original,
    "Revisões previstas: 4000, 12000, 20000 h",
  );
  assert.equal(oil.interval_hours, null);
  assert.match(oil.observation, /Quantidade na lista: 5/);
  const filters = data.entries.filter(
    (e) => e.description === "Filtro de admissão",
  );
  assert.deepEqual(
    filters.map((e) => e.code),
    ["3120272", "3120295"],
  );
  assert.ok(
    filters.every((e) =>
      e.observation.includes(
        "Quantidade do conjunto: 2; quantidade individual não informada",
      ),
    ),
  );
  const separator = data.entries.find((e) =>
    e.description.includes("após a série"),
  )!;
  assert.equal(separator.interval_original, "");
  assert.match(separator.observation, /Quantidade na lista: não informada/);
  assert.equal(
    data.entries.find((e) => e.description === "Coalescente")!.code,
    null,
  );
  assert.equal(
    data.entries.find((e) => e.description.startsWith("Revisão"))!.code,
    null,
  );
  assert.deepEqual(
    parseRjPreventive(bytes, filename).entries.map((e) => e.id),
    data.entries.map((e) => e.id),
  );
});
test("RJ import stops on unknown flags, formulas, invalid quantities or missing models", () => {
  assert.throws(
    () =>
      parseRjPreventive(
        fixture((s) => {
          s.H5 = { t: "s", v: "?" };
        }),
        filename,
      ),
    /Marcação desconhecida/,
  );
  assert.throws(
    () =>
      parseRjPreventive(
        fixture((s) => {
          s.D5 = { t: "n", v: 0 };
        }),
        filename,
      ),
    /Quantidade inválida/,
  );
  assert.throws(
    () =>
      parseRjPreventive(
        fixture((s) => {
          s.B5 = { t: "n", v: 123456, f: "1+123455" };
        }),
        filename,
      ),
    /calculada não prevista/,
  );
  assert.throws(
    () => parseRjPreventive(fixture(), "Linha TPF.xlsx"),
    /Abas\/modelos/,
  );
});

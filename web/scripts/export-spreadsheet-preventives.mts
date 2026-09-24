import * as XLSX from "xlsx";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { database } from "../lib/db";
const directory = new URL(
  "../../.m8/spreadsheet-preventives/",
  import.meta.url,
);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const sources: any[] = [];
for (const [key, name] of [
  ["rj", "Tabela Controle Manutenções - GRUPO RJ.xlsx"],
  [
    "serrana",
    "Tabela Controle Manutenções - Serrana - Criciuma Compressores.xlsx",
  ],
]) {
  const bytes = readFileSync(new URL("../../" + name, import.meta.url));
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
  writeFileSync(
    new URL(key + ".json", directory),
    JSON.stringify(
      workbook.SheetNames.map((sheet) => ({
        sheet,
        rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheet], {
          header: 1,
          defval: null,
        }),
      })),
    ),
    { mode: 0o600 },
  );
  sources.push({
    file: name,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
writeFileSync(
  new URL("sources.json", directory),
  JSON.stringify(sources, null, 2),
  { mode: 0o600 },
);
const db = database();
try {
  const equipment = (
    await db.query(
      `SELECT e.equipment_id::text id,e.serial,e.name,e.model,e.payload->>'familiaId' family,s.document,s.version,COALESCE((SELECT jsonb_agg(person_id::text) FROM m8_person_equipment p WHERE p.equipment_id=e.equipment_id),'[]') clients FROM m8_equipment_catalog e LEFT JOIN web_equipment_settings s USING(equipment_id) WHERE e.present`,
    )
  ).rows;
  const plans = (
    await db.query(
      "SELECT id,equipment_id::text equipment_id,document,version,archived FROM web_equipment_plans",
    )
  ).rows;
  writeFileSync(
    new URL("current.json", directory),
    JSON.stringify({ equipment, plans }),
    { mode: 0o600 },
  );
  writeFileSync(
    new URL("m8-equipment.json", directory),
    JSON.stringify(equipment),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      equipment: equipment.length,
      plans: plans.length,
      sources: sources.length,
    }),
  );
} finally {
  await db.end();
}

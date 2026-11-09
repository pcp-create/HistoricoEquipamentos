import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
test("visits uses the shared ERP registration with a preselected customer and pending link", async ({
  page,
}) => {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';import{createRoot}from'react-dom/client';import Screen from './components/visit-machine-registration';createRoot(document.getElementById('root')).render(<Screen customer="m8:10" name="Cliente sem máquinas" online/>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    outdir: "out",
    jsx: "automatic",
  });
  await page.route("**/visit-equipment-test", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync("app/globals.css", "utf8")}\n${bundle.outputFiles.find((f) => f.path.endsWith(".css"))!.text}</style><div id="root"></div><script>${bundle.outputFiles.find((f) => f.path.endsWith(".js"))!.text}</script>`,
    }),
  );
  await page.route("**/api/workshop/equipment?*", (r) =>
    r.fulfill({ json: { rows: [] } }),
  );
  let body: any;
  await page.route("**/api/visits/machines*", (r) => {
    if (r.request().method() === "POST") {
      body = r.request().postDataJSON();
      return r.fulfill({
        json: {
          state: "complete",
          equipment: { id: "500", taskId: "42", integrationPending: true },
        },
      });
    }
    return r.fulfill({
      json: {
        machines: body
          ? [
              {
                id: body.requestId,
                equipment_id: "500",
                task_id: "42",
                integration_pending: true,
                model: "GA30",
                equipment_type: "Compressor Parafuso",
                serial: "SN100",
              },
            ]
          : [],
      },
    });
  });
  await page.goto("/visit-equipment-test");
  await page.getByRole("button", { name: "Cadastrar máquina" }).click();
  const dialog = page.getByRole("dialog", { name: "Cadastrar equipamento" });
  await expect(dialog.getByLabel("Cliente *", { exact: true })).toHaveValue(
    "Cliente sem máquinas",
  );
  await dialog
    .getByRole("combobox", { name: "Tipo do equipamento *", exact: true })
    .selectOption("screw");
  await dialog.getByLabel("Modelo *", { exact: true }).fill("GA30");
  await dialog.getByLabel("Série *", { exact: true }).fill("SN100");
  await dialog.getByLabel("Horímetro (h)", { exact: true }).fill("1500");
  await expect(
    dialog.getByRole("button", { name: "Cadastrar e selecionar" }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Cadastrar e selecionar" }).click();
  await expect(dialog).not.toBeVisible();
  expect(body).toMatchObject({
    customerKey: "m8:10",
    source: "visits",
    type: "screw",
    model: "GA30",
    serial: "SN100",
    meter: 1500,
  });
  await expect(
    page.getByText("Equipamento 500 cadastrado no ERP"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Tarefa TAR-42 · Vínculo manual" }),
  ).toBeVisible();
});

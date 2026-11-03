import { test, expect } from "@playwright/test";
test("B.O registration selects equipment and expands complete record on mobile", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: true } }),
  );
  const equipment = { id: "100", name: "COMPRESSOR TECHTO", serial: "4074" };
  const items: any[] = [];
  let saved: any;
  let deleteCalls=0;
  let canDelete=true;
  await page.route("**/api/equipment-occurrences*", async (r) => {
    const p = new URL(r.request().url()).searchParams;
    if(r.request().method()==='DELETE'){deleteCalls++;items.splice(0,items.length);return r.fulfill({json:{deleted:true}});}
    if (r.request().method() === "POST") {
      saved = r.request().postDataJSON();
      items.unshift({
        id: "bo1",
        equipment_id: saved.equipmentId,
        equipment_name: equipment.name,
        serial: equipment.serial,
        occurred_on: saved.occurredOn,
        title: saved.title,
        description: saved.description,
        author: "Planejador",
        created_at: "2026-11-03T12:00:00Z",
      });
      return r.fulfill({ status: 201, json: { id: "bo1" } });
    }
    return r.fulfill({
      json: p.has("q") ? { equipment: [equipment] } : { items,canDelete },
    });
  });
  await page.goto("/modulos/operacoes");
  await page.getByRole("link", { name: "B.O", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "B.O", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Registrar B.O" }),
  ).toBeDisabled();
  await page.getByLabel("Equipamento", { exact: true }).fill("4074");
  await page.getByRole("button", { name: /COMPRESSOR TECHTO/ }).click();
  await page.getByRole("button", { name: "Registrar B.O" }).click();
  await page.getByLabel("Data da ocorrência").fill("2026-11-03");
  await page.getByLabel("Título", { exact: true }).fill("Vazamento na conexão");
  const full =
    "Inspecionar a conexão antes da partida. " +
    "Orientação para a equipe técnica. ".repeat(12) +
    "Referência final ABC123.";
  await page.getByLabel("Descrição completa").fill(full);
  await page.getByRole("button", { name: "Salvar ocorrência" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "B.O registrado no histórico do equipamento.",
  );
  expect(saved.equipmentId).toBe("100");
  await expect(page.locator(".bo-item summary")).toContainText("03/11/2026");
  await expect(page.getByText(full, { exact: true })).toBeHidden();
  await page.locator(".bo-item summary").click();
  await expect(page.getByText(full, { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/bo-mobile.png", fullPage: true });
  const trash=page.getByRole('button',{name:'Excluir B.O: Vazamento na conexão',exact:true});
  await expect(trash).toBeVisible();
  canDelete=false;await page.reload();await page.locator('.bo-item summary').click();
  await expect(trash).toHaveCount(0);
  canDelete=true;await page.reload();await page.locator('.bo-item summary').click();
  page.once('dialog',d=>d.dismiss());await trash.click();expect(deleteCalls).toBe(0);await expect(page.locator('.bo-item')).toHaveCount(1);
  page.once('dialog',d=>d.accept());await trash.click();await expect(page.locator('.bo-item')).toHaveCount(0);expect(deleteCalls).toBe(1);await expect(page.getByRole('status')).toHaveText('B.O excluído.');

});

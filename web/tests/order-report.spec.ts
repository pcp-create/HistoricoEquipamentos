import { test, expect } from "@playwright/test";
import { blankOperation } from "../lib/service-scheduling/model";

test("planner selects reviewed operations, previews chronology and modes, and downloads only the selection", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: true } }),
  );
  const template = {
    id: "c",
    name: "Corretiva",
    stages: [
      {
        id: "s",
        name: "Medições",
        fields: [
          { id: "meter", type: "number", label: "Horímetro" },
          { id: "empty", type: "text", label: "Campo vazio" },
          {
            id: "f",
            type: "flag",
            label: "Condição",
            options: ["OK", "NOK", "NA"],
            internalNote: true,
          },
        ],
      },
    ],
  };
  const operations = [1, 2, 3].map((n) => ({
    id: `10000000-0000-4000-8000-00000000000${n}`,
    version: 1,
    position: n,
    status: n === 3 ? "awaiting_review" : "reviewed",
    document: {
      ...blankOperation(),
      description: `Atendimento ${n}`,
      responsible: "tech",
      checklistId: "c",
      checklistRun: {
        template,
        stages: {
          s: {
            status: "submitted",
            answers: { meter: n * 1000, f: "OK" },
            details: { f: { internalNote: "Nota para orçamento" } },
          },
        },
        submission: { at: "2026-09-30T12:00:00Z", by: "tech" },
      },
    },
  }));
  const data = {
    canEditSettings: true,
    email: "planner",
    settings: {
      document: {
        checklists: [template],
        serviceTypes: [],
        calendars: [],
        vehicles: [],
      },
    },
    users: [{ email: "tech", display_name: "Técnico", enabled: true }],
    schedule: { id: "1", company_id: 1, order_id: "14877" },
    detail: {
      order: {
        numero_sequencia: 14877,
        cliente_nome: "Cliente",
        equipamento: "Compressor",
      },
      materials: [],
      services: [],
    },
    operations,
    usage: [],
    costs: [],
    events: [],
    fieldEvents: [],
    requests: [],
    profit: null,
    fieldSessions: [1, 2].map((n) => ({
      id: `s${n}`,
      operation_id: operations[n - 1].id,
      actor: "tech",
      kind: "work",
      state: "finished",
      active_seconds: 3600,
      pause_seconds: 0,
      started_at: `2026-09-${n === 1 ? "30" : "29"}T12:00:00Z`,
      finished_at: `2026-09-${n === 1 ? "30" : "29"}T13:00:00Z`,
    })),
  };
  let exports = 0;
  await page.route("**/api/service-scheduling**", async (r) => {
    if (r.request().url().endsWith("/order-report")) {
      expect(r.request().postDataJSON()).toEqual({
        scheduleId: "1",
        operationIds: [operations[0].id, operations[1].id],
        mode: "budget",
      });
      if (!exports++)
        return r.fulfill({
          status: 409,
          json: { error: "Uma operação precisa de revisão." },
        });
      return r.fulfill({
        contentType: "application/pdf",
        body: Buffer.from("%PDF-1.4\nmock"),
        headers: { "Content-Disposition": 'attachment; filename="report.pdf"' },
      });
    }
    return r.fulfill({ json: data });
  });
  await page.goto("/programacao?id=1");
  await page
    .getByRole("button", { name: "Gerar relatório da OS", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Relatório unificado da OS",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Gerar PDF unificado" }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("checkbox", { name: /Operação 03/ }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Selecionar todas as revisadas" })
    .click();
  await expect(
    dialog.getByText("2 operação(ões) selecionada(s)", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "2. Visualizar relatório" }).click();
  await expect(
    dialog
      .locator(".order-report-chapter")
      .first()
      .locator(".technical-report-order"),
  ).toContainText("14877/02");
  await expect(
    dialog.getByRole("heading", { name: /Linha do tempo das operações/ }),
  ).toBeVisible();
  await expect(dialog.locator(".operation-milestones > li")).toHaveCount(2);
  await expect(
    dialog.locator(".operation-milestones > li").first(),
  ).toContainText("29/09/2026");
  await expect(
    dialog.locator(".operation-milestones > li").first(),
  ).toContainText("Atendimento 2");
  const milestones = await dialog
    .locator(".operation-milestones > li")
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        x: n.getBoundingClientRect().x,
        y: n.getBoundingClientRect().y,
      })),
    );
  expect(milestones[1].x).toBeGreaterThan(milestones[0].x);
  expect(milestones[1].y).toBe(milestones[0].y);
  await expect(
    dialog.getByText("Nota para orçamento", { exact: false }),
  ).toHaveCount(0);
  await dialog
    .getByRole("combobox", { name: "Tipo do relatório unificado" })
    .selectOption("summary");
  await expect(dialog.getByText("Campo vazio", { exact: true })).toHaveCount(0);
  await expect(
    dialog.getByText("Tempo de paradas", { exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("combobox", { name: "Tipo do relatório unificado" })
    .selectOption("budget");
  await expect(
    dialog.getByText(/Observação interna: Nota para orçamento/),
  ).toHaveCount(2);
  await page.screenshot({ path: "/tmp/order-report-desktop.png" });
  await dialog.getByRole("button", { name: "Gerar PDF unificado" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Uma operação precisa de revisão.",
  );
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Gerar PDF unificado" }).click();
  expect((await download).suggestedFilename()).toBe(
    "Relatorio-OS-14877-unificado-budget.pdf",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
    true,
  );
  await dialog.getByRole("button", { name: "1. Selecionar operações" }).click();
  await page.screenshot({ path: "/tmp/order-report-mobile.png" });
  await dialog.getByRole("button", { name: "Limpar seleção" }).click();
  await expect(
    dialog.getByRole("button", { name: "Gerar PDF unificado" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Fechar relatório da OS" }).click();
  await expect(dialog).toHaveCount(0);
});

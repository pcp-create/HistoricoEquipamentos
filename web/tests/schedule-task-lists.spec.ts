import { test, expect } from "@playwright/test";
import { blankOperation } from "../lib/service-scheduling/model";
import { taskListOperation } from "../lib/service-scheduling/task-list-model";
test("planner creates a partial list from an OS, confirms replacement and manages lists in settings", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: true } }),
  );
  await page.route("**/api/tasks?**", (r) =>
    r.fulfill({ json: { tasks: [] } }),
  );
  const data: any = {
    canEditSettings: true,
    email: "tech",
    settings: {
      version: 1,
      document: {
        serviceTypes: ["Interno"],
        checklists: [],
        vehicles: [],
        calendars: [
          {
            id: "standard",
            name: "Padrão",
            week: [{ day: 1, start: "08:00", end: "18:00" }],
          },
        ],
      },
    },
    users: [{ email: "tech", display_name: "Técnico", enabled: true }],
    schedule: { id: "1", company_id: 1, order_id: "15052" },
    detail: {
      order: { numero_sequencia: 15052, cliente_nome: "Cliente" },
      materials: [],
      services: [],
    },
    operations: [
      {
        id: "10000000-0000-4000-8000-000000000001",
        position: 1,
        version: 1,
        status: "pending",
        document: {
          ...blankOperation(),
          description: "Inspeção",
          duration: 2,
          responsible: "tech",
          date: "2026-10-21",
          time: "09:00",
        },
      },
    ],
    usage: [],
    costs: [],
    events: [],
    fieldEvents: [],
    fieldSessions: [],
    requests: [],
  };
  let lists: any[] = [];
  let applied = 0;
  await page.route("**/api/service-scheduling**", async (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({
        json: new URL(r.request().url()).searchParams.has("taskLists")
          ? { lists }
          : data,
      });
    const b = r.request().postDataJSON();
    if (b.action === "task_list_save") {
      if (b.sourceScheduleId) {
        expect(b.expectedOperations).toEqual([
          { id: data.operations[0].id, version: 1 },
        ]);
        expect(b.fields).toEqual(["description", "duration"]);
      }
      const list = {
        id: b.id || "20000000-0000-4000-8000-00000000000" + (lists.length + 1),
        version: b.version ? b.version + 1 : 1,
        name: b.name,
        document: {
          fields: b.fields,
          operations: (b.sourceScheduleId
            ? data.operations.map((o: any) => o.document)
            : b.operations
          ).map((op: any) => taskListOperation(op, b.fields)),
        },
      };
      lists = [...lists.filter((l) => l.id !== list.id), list];
      return r.fulfill({ json: { list } });
    }
    if (b.action === "task_list_apply") {
      expect(b.confirmReplace).toBe(true);
      applied++;
      data.operations = lists
        .find((l) => l.id === b.id)
        .document.operations.map((document: any, index: number) => ({
          id: "30000000-0000-4000-8000-000000000001",
          version: 1,
          position: index + 1,
          status: "pending",
          document,
        }));
      return r.fulfill({ json: { operations: data.operations } });
    }
    if (b.action === "task_list_delete") {
      lists = lists.filter((l) => l.id !== b.id);
      return r.fulfill({ json: { removed: b.id } });
    }
    return r.fulfill({ json: { error: "Unexpected request" }, status: 400 });
  });
  await page.goto("/programacao?id=1");
  await page
    .getByRole("button", { name: "Criar Lista de Tarefas", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Criar Lista de Tarefas",
    exact: true,
  });
  await dialog
    .getByLabel("Nome da lista", { exact: true })
    .fill("Inspeção padrão");
  await dialog.getByLabel("Todos os campos de planejamento").uncheck();
  await dialog.getByLabel("Descrição da operação", { exact: true }).check();
  await dialog.getByLabel("Duração (h)", { exact: true }).check();
  await dialog
    .getByRole("button", { name: "Salvar lista", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Atribuir Lista de Tarefas", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Atribuir Lista de Tarefas",
    exact: true,
  });
  await dialog
    .getByRole("combobox", { name: "Lista de tarefas", exact: true })
    .selectOption(lists[0].id);
  await expect(
    dialog.getByRole("button", { name: "Substituir operações" }),
  ).toBeDisabled();
  await expect(dialog.getByText("Inspeção", { exact: true })).toBeVisible();
  await dialog
    .getByRole("checkbox", {
      name: "Confirmo a substituição das operações desta OS.",
    })
    .check();
  await dialog.getByRole("button", { name: "Substituir operações" }).click();
  await expect(dialog).toHaveCount(0);
  expect(applied).toBe(1);
  expect(data.operations[0].document.date).toBe("");
  expect(data.operations[0].document.responsible).toBe("");
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Listas de Tarefas", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Inspeção padrão", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Nova lista de tarefas", exact: true })
    .click();
  await page
    .getByLabel("Nome da lista", { exact: true })
    .fill("Nova manutenção");
  await page.getByLabel("Todos os campos de planejamento").uncheck();
  await page.getByLabel("Descrição da operação", { exact: true }).check();
  await page
    .locator(".task-list-operation")
    .getByLabel("Descrição da operação", { exact: true })
    .fill("Trocar filtro");
  await page
    .getByRole("button", { name: "Adicionar operação à lista" })
    .click();
  await page
    .locator(".task-list-operation")
    .nth(1)
    .getByLabel("Descrição da operação", { exact: true })
    .fill("Testar compressor");
  await page.getByRole("button", { name: "Subir operação 2" }).click();
  await page.getByRole("button", { name: "Salvar lista", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nova manutenção", exact: true }),
  ).toBeVisible();
  expect(lists[1].document.operations.map((o: any) => o.description)).toEqual([
    "Testar compressor",
    "Trocar filtro",
  ]);
  const card = page
    .locator(".task-list-catalog article")
    .filter({
      has: page.getByRole("heading", { name: "Nova manutenção", exact: true }),
    });
  await card.getByRole("button", { name: "Editar", exact: true }).click();
  await page
    .getByLabel("Nome da lista", { exact: true })
    .fill("Manutenção revisada");
  await page.getByRole("button", { name: "Salvar lista", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .locator(".task-list-catalog article")
    .filter({
      has: page.getByRole("heading", {
        name: "Manutenção revisada",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Excluir" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Manutenção revisada", exact: true }),
  ).toHaveCount(0);
});

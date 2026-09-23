import { test, expect } from "@playwright/test";
test("tasks list, personal view, calendar and right drawer keep notes and assignee controls", async ({
  page,
  context,
  request,
}) => {
  expect((await request.get("/api/tasks")).status()).toBe(401);
  expect(
    (await request.post("/api/tasks", { data: { action: "sync" } })).status(),
  ).toBe(403);
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: false } }),
  );
  let task: any = {
    id: "42",
    equipment_id: "1",
    plan_id: null,
    title: "Acompanhar locação",
    equipment_name: "Compressor GA37",
    origin: "Máquina de Locação",
    customer: "Cliente teste",
    source_status: "soon",
    status: "not_started",
    priority: "normal",
    assigned_to: null,
    priority_manual: false,
    version: 1,
    created_at: "2026-09-23T10:00:00Z",
    updated_at: "2026-09-23T10:00:00Z",
    updated_by: "Sistema",
    due_date: "2026-09-28",
  };
  let notes: any[] = [];
  await page.route("**/api/tasks**", async (r) => {
    const url = new URL(r.request().url());
    if (r.request().method() === "POST") {
      const b = r.request().postDataJSON();
      if (b.action === "sync")
        return r.fulfill({ json: { created: 0, completed: 0 } });
      if (b.action === "note")
        notes = [
          {
            id: "1",
            title: b.title,
            description: b.description,
            created_by: "user@example.com",
            created_name: "Pessoa",
            created_at: "2026-09-23T11:00:00Z",
          },
          ...notes,
        ];
      if (b.action === "move")
        task = {
          ...task,
          kanban_column: b.column,
          status:
            b.column === "completed"
              ? "completed"
              : b.column === "in_progress"
                ? "in_progress"
                : "not_started",
          version: task.version + 1,
        };
      if (b.action === "update")
        task = {
          ...task,
          assigned_to: b.assignedTo,
          status: "in_progress",
          priority: b.priority,
          version: task.version + 1,
        };
      return r.fulfill({
        json: { task, notes, attachments: [], notifications: [] },
      });
    }
    return r.fulfill({
      json: url.searchParams.has("id")
        ? { task, notes, attachments: [], notifications: [] }
        : {
            tasks: [task],
            users: [
              {
                email: "user@example.com",
                display_name: "Pessoa",
                phone: "5547999999999",
              },
            ],
            email: "user@example.com",
            syncedAt: "2026-09-23T11:00:00Z",
          },
    });
  });
  await page.goto("/tarefas");
  await expect(
    page.getByText("TAR-42 · Acompanhar locação", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Minhas tarefas" }).click();
  await expect(page.getByText("Nenhuma tarefa encontrada.")).toBeVisible();
  await page.getByRole("button", { name: "Últimas tarefas · Todos" }).click();
  await page.getByText("TAR-42 · Acompanhar locação", { exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Atribuído a").selectOption("user@example.com");
  await dialog
    .getByRole("button", { name: "Salvar responsável e prioridade" })
    .click();
  await expect(dialog.getByText("Em andamento", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Incluir nota" }).click();
  await dialog.getByLabel("Título da nota").fill("Contato com cliente");
  await dialog.getByLabel("Descritivo da nota").fill("Aguardando renovação.");
  await dialog.getByRole("button", { name: "Salvar nota" }).click();
  await expect(dialog.getByText("Aguardando renovação.")).toBeVisible();
  await page.screenshot({ path: "/tmp/tasks-preview.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Calendário", exact: true }).click();
  await page.getByLabel("Mês", { exact: true }).fill("2026-09");
  await expect(
    page.getByRole("button", { name: /TAR-42 · Compressor GA37/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Kanban", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Modo de visualização" }),
  ).toBeVisible();
  const card = page.locator(".task-kanban-card").filter({ hasText: "TAR-42" });
  await card.dragTo(
    page.getByRole("region", { name: "Atrasadas", exact: true }),
  );
  await expect(
    page
      .getByRole("region", { name: "Atrasadas", exact: true })
      .locator(".task-kanban-card"),
  ).toHaveCount(1);
  await page.getByLabel("Mover TAR-42").selectOption("completed");
  await expect(
    page
      .getByRole("region", { name: "Concluídas", exact: true })
      .locator(".task-kanban-card"),
  ).toHaveCount(1);
  await expect(page.getByLabel("Mover TAR-42")).toHaveCount(0);
});

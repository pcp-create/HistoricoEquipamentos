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
    source_key: "manual:test",
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
  page.on("dialog", async d => { if (d.type() === "prompt") await d.accept("Redistribuição da equipe"); });
  let notes: any[] = [];
  await page.route("**/api/tasks**", async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname === "/api/tasks/reminders") return r.fulfill({ json: { reminders: [] } });
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
      if (b.action === "reopen") task = { ...task, status: "not_started", kanban_column: null, version: task.version + 1 };
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
  await page
    .getByRole("combobox", { name: "Responsável", exact: true })
    .selectOption("user@example.com");
  await expect(page.getByText("Nenhuma tarefa encontrada.")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Responsável", exact: true })
    .selectOption("unassigned");
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
  await page.getByRole("combobox", { name: "Responsável", exact: true }).selectOption("all");
  await page.getByRole("button", { name: "Kanban", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Modo de visualização" }),
  ).toBeVisible();
  const card = page.locator(".task-kanban-card").filter({ hasText: "TAR-42" });
  await card.dragTo(
    page.getByRole("region", { name: "Não iniciado", exact: true }),
  );
  await expect(
    page
      .getByRole("region", { name: "Não iniciado", exact: true })
      .locator(".task-kanban-card"),
  ).toHaveCount(1);
  await page.getByLabel("Agrupar Kanban por").selectOption("deadline");
  await expect(page.getByRole("region", { name: "Dentro do prazo", exact: true })).toBeVisible();
  await page.getByLabel("Agrupar Kanban por").selectOption("responsible");
  await expect(page.getByRole("region", { name: "Pessoa", exact: true }).locator(".task-kanban-card")).toHaveCount(1);
  await card.dragTo(page.getByRole("region", { name: "Não atribuído", exact: true }));
  await expect(page.getByRole("region", { name: "Não atribuído", exact: true }).locator(".task-kanban-card")).toHaveCount(1);
  await card.dragTo(page.getByRole("region", { name: "Pessoa", exact: true }));
  await expect(page.getByRole("region", { name: "Pessoa", exact: true }).locator(".task-kanban-card")).toHaveCount(1);
  await page.getByLabel("Agrupar Kanban por").selectOption("progress");
  await card.getByText("Compressor GA37", { exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Concluir tarefa", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("Tarefa manual concluída. Você pode reabri-la em Acompanhamento."),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Concluir tarefa", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Fechar tarefa" }).click();
  await expect(
    page
      .getByRole("region", { name: "Concluído", exact: true })
      .locator(".task-kanban-card"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Concluir tarefa", exact: true }),
  ).toHaveCount(0);
  page.once("dialog", async (d) => { expect(d.message()).toBe("Deseja reabrir esta tarefa?"); await d.dismiss(); });
  await card.getByRole("button", { name: "Reabrir tarefa", exact: true }).click();
  await expect(card.getByRole("button", { name: "Reabrir tarefa", exact: true })).toBeVisible();
  page.once("dialog", async (d) => { await d.accept(); });
  await card.getByRole("button", { name: "Reabrir tarefa", exact: true }).click();
  await expect(page.getByRole("region", { name: "Não iniciado", exact: true }).locator(".task-kanban-card")).toHaveCount(1);
  await card.locator(".task-kanban-title").hover();
  await card.getByRole("button", { name: "Concluir tarefa", exact: true }).click();
  await expect(card.getByRole("button", { name: "Reabrir tarefa", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

});

test("returning through modules reuses task data without another synchronization", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  // Simulate the verified identity emitted by the server layout, without real credentials.
  await page.addInitScript(() => {
    const original = document.querySelector.bind(document);
    document.querySelector = ((selector: string) =>
      selector === 'meta[name="app-cache-scope"]'
        ? { content: "cache-test-user:user" }
        : original(selector)) as typeof document.querySelector;
  });
  let reads = 0,
    syncs = 0;
  await page.route("**/api/activity", (r) =>
    r.fulfill({ json: { admin: false } }),
  );
  await page.route("**/api/tasks", (r) => {
    if (r.request().method() === "POST") {
      syncs++;
      return r.fulfill({ json: { created: 0, completed: 0 } });
    }
    reads++;
    return r.fulfill({
      json: { tasks: [], users: [], email: "test@example.com", syncedAt: null },
    });
  });
  await page.goto("/tarefas");
  await expect(page.getByText("Nenhuma tarefa encontrada.")).toBeVisible();
  await expect.poll(() => reads).toBe(1);
  await expect.poll(() => syncs).toBe(1);
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name: "Módulos", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Módulos do sistema" })
    .getByRole("link", { name: /Tarefas/ })
    .click();
  await expect(page.getByText("Nenhuma tarefa encontrada.")).toBeVisible();
  await expect.poll(() => reads).toBe(1);
  await expect.poll(() => syncs).toBe(1);

});

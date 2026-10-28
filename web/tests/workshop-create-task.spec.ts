import { test, expect } from "@playwright/test";
for (const taskType of ["standard", "approval"])
  test(`workshop creates a linked ${taskType} task`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: "m8-access", value: "test", domain: "localhost", path: "/" },
    ]);
    const visit: any = {
      id: "12345678-1234-4234-8234-123456789abc",
      equipment_id: "77",
      name: "Compressor oficina",
      client: "Cliente oficina",
      serial: "SER123",
      model: "GA22",
      workshop_id: "1",
      workshop: "Oficina RJ",
      entered_at: "2026-10-10T12:00:00Z",
      exited_at: null,
      stage: "repair",
      effective_stage: "repair",
      version: 1,
      orders: [],
      quotes: [],
      drafts: [],
      tasks: [],
      external: [],
      events: [],
    };
    let payload: any;
    await page.route("**/api/**", (r) => r.fulfill({ json: { admin: true } }));
    await page.route("**/api/workshop", (r) =>
      r.fulfill({
        json: {
          workshops: [{ id: "1", name: "Oficina RJ", active: true }],
          visits: [visit],
          imports: [],
          external: [],
        },
      }),
    );
    await page.route("**/api/tasks/context?*", (r) =>
      r.fulfill({
        json: {
          equipmentName: visit.name,
          customer: visit.client,
          workshop: visit,
          users: [
            { email: "approver@test.com", display_name: "Responsável teste" },
          ],
        },
      }),
    );
    await page.route("**/api/tasks", (r) => {
      payload = r.request().postDataJSON();
      visit.events = [
        {
          id: "1",
          action: "Tarefa TAR-42 · Tarefa criada",
          actor_name: "Solicitante",
          created_at: "2026-10-28T12:00:00Z",
          document: { taskId: "42", notes: payload.description },
        },
      ];
      visit.tasks = [{ id: "42", title: payload.title, status: "not_started" }];
      return r.fulfill({ json: { task: { id: "42" } } });
    });
    await page.goto("/oficina");
    await page.locator(".ws-priority-link").click();
    const drawer = page.getByRole("dialog", { name: "Ficha da máquina" });
    await drawer
      .getByRole("button", { name: "Criar tarefa", exact: true })
      .click();
    const form = page.getByRole("dialog", { name: "Criar tarefa da oficina" });
    await expect(form).toContainText("Cliente oficina");
    await expect(form).toContainText("Compressor oficina");
    await expect(
      form.getByRole("button", { name: "Criar tarefa", exact: true }),
    ).toBeDisabled();
    await form.getByLabel("Tipo de tarefa").selectOption(taskType);
    await form
      .getByRole("combobox", {
        name:
          taskType === "approval"
            ? "Responsável pela aprovação"
            : "Atribuído a",
        exact: true,
      })
      .selectOption("approver@test.com");
    await form.getByLabel("Título", { exact: true }).fill("Conferir motor");
    await form
      .getByLabel("Descrição", { exact: true })
      .fill("Analisar orçamento do motor");
    await form
      .getByRole("combobox", { name: "Prioridade", exact: true })
      .selectOption("high");
    await form
      .getByRole("button", { name: "Criar tarefa", exact: true })
      .click();
    await expect(form).toHaveCount(0);
    expect(payload).toMatchObject({
      action: "create",
      taskType,
      workshopVisitId: visit.id,
      title: "Conferir motor",
      description: "Analisar orçamento do motor",
      assignedTo: "approver@test.com",
      priority: "high",
    });
    expect(payload.equipmentId).toBeUndefined();
    expect(payload.customer).toBeUndefined();
    await expect(drawer.getByRole("link", { name: /TAR-42/ })).toHaveAttribute(
      "href",
      "/tarefas?task=42",
    );
    await drawer
      .getByRole("button", { name: "Histórico", exact: true })
      .click();
    await expect(drawer.locator(".ws-timeline")).toContainText(
      "Tarefa TAR-42 · Tarefa criada",
    );
    await expect(drawer.locator(".ws-timeline")).toContainText(
      "Analisar orçamento do motor",
    );
    await expect(
      drawer
        .locator(".ws-timeline")
        .getByRole("link", { name: "Abrir tarefa TAR-42" }),
    ).toHaveAttribute("href", "/tarefas?task=42");
  });

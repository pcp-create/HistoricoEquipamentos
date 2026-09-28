import { test, expect } from "@playwright/test";
test("task drawer schedules a Brasilia reminder and allows cancelling it", async ({
  page,
  context,
  request,
}) => {
  expect((await request.get("/api/tasks/reminders?taskId=1")).status()).toBe(
    401,
  );
  expect(
    (await request.post("/api/tasks/reminders", { data: {} })).status(),
  ).toBe(403);
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  await page.route("**/api/activity", (r) => r.fulfill({ json: {} }));
  const task = {
    id: "1",
    title: "Conferir OS",
    source_key: "manual:x",
    origin: "Tarefa manual",
    status: "in_progress",
    priority: "normal",
    assigned_to: "a@example.com",
    assignee_name: "Sara",
  };
  await page.route("**/api/tasks", (r) =>
    r.fulfill({ json: { tasks: [task], users: [] } }),
  );
  await page.route("**/api/tasks?id=1", (r) =>
    r.fulfill({
      json: { task, notes: [], attachments: [], notifications: [] },
    }),
  );
  let rows: any[] = [],
    posted: any;
  await page.route("**/api/tasks/reminders**", (r) => {
    if (r.request().method() === "POST") {
      posted = r.request().postDataJSON();
      rows =
        posted.action === "cancel"
          ? rows.map((x) => ({ ...x, state: "cancelled" }))
          : [
              {
                id: "1",
                scheduled_at: "2099-01-01T10:30:00Z",
                state: "pending",
                recipient_name: "Sara",
                series_id: posted.recurrence ? "series" : null,
                rule: posted.recurrence,
              },
            ];
      return r.fulfill({ json: { saved: true } });
    }
    return r.fulfill({ json: { reminders: rows } });
  });
  await page.goto("/tarefas?task=1");
  await page.getByRole("button", { name: "Criar alerta", exact: true }).click();
  await page
    .getByLabel("Data e hora do alerta (Brasília)")
    .fill("2099-01-01T07:30");
  await page
    .getByRole("button", { name: "Agendar alerta", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancelar alerta", exact: true }),
  ).toBeVisible();
  expect(posted.when).toBe("2099-01-01T07:30");
  expect(posted.taskId).toBe("1");
  await page
    .getByRole("button", { name: "Cancelar alerta", exact: true })
    .click();
  await expect(page.getByText("Cancelado", { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Criar alerta", exact: true }).click();
  await page
    .getByLabel("Data e hora do alerta (Brasília)")
    .fill("2099-01-31T07:30");
  await page.getByLabel("Recorrência", { exact: true }).selectOption("monthly");
  await page.getByLabel("Termina", { exact: true }).selectOption("count");
  await page.getByLabel("Ocorrências (incluindo o primeiro alerta)").fill("3");
  await expect(page.locator(".reminder-preview")).toContainText("28/02/2099");
  await expect(page.locator(".reminder-preview")).toContainText("31/03/2099");
  const overflow = await page
    .locator(".reminder-recurrence")
    .evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflow).toBe(false);
  await page
    .getByRole("button", { name: "Agendar alerta", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancelar recorrência", exact: true }),
  ).toBeVisible();
  expect(posted.recurrence).toMatchObject({
    frequency: "monthly",
    interval: 1,
    end: "count",
    count: 3,
  });
  await page
    .getByRole("button", { name: "Cancelar recorrência", exact: true })
    .click();
  await expect(page.getByText("Cancelado", { exact: false })).toBeVisible();
});

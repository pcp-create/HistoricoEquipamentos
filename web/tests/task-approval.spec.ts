import { test, expect } from "@playwright/test";
for (const decision of ["approved", "rejected"])
  test(`approval requires justification before ${decision} and shows the result`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: "m8-access", value: "test", domain: "localhost", path: "/" },
    ]);
    await page.route("**/api/activity", (r) => r.fulfill({ json: {} }));
    await page.route("**/api/task-stages", (r) =>
      r.fulfill({ json: { stages: [] } }),
    );
    let t: any = {
      id: "42",
      task_type: "approval",
      approval_state: "pending",
      approval_description: "Autorizar compra do motor para a OS 15119.",
      title: "Compra de motor",
      status: "not_started",
      version: 1,
      priority: "normal",
      source_key: "manual:workshop:12345678-1234-4234-8234-123456789abc:42",
      equipment_name: "Compressor oficina",
      customer: "Cliente oficina",
      assigned_to: "approver@test.com",
      created_by: "requester@test.com",
    };
    const writes: any[] = [];
    await page.route("**/api/tasks*", (r) => {
      if (r.request().method() === "POST") {
        const b = r.request().postDataJSON();
        if (b.action === "approval_decide") {
          writes.push(b);
          t = {
            ...t,
            approval_state: b.decision,
            approval_reason: b.reason,
            approval_decided_at: "2026-10-28T12:00:00Z",
            assigned_to: "requester@test.com",
            version: 2,
            status: "in_progress",
          };
        }
        return r.fulfill({
          json: { task: t, notes: [], attachments: [], notifications: [] },
        });
      }
      return r.fulfill({
        json: r.request().url().includes("id=")
          ? {
              task: t,
              notes: [],
              attachments: [],
              notifications: [],
              canDecideApproval: t.approval_state === "pending",
              canCloseApproval: false,
            }
          : { tasks: [t], users: [], email: "approver@test.com" },
      });
    });
    await page.goto("/tarefas?task=42");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(t.approval_description)).toBeVisible();
    await expect(dialog).toContainText("Cliente oficina");
    await expect(dialog).toContainText("Compressor oficina");
    const approved = decision === "approved";
    await dialog
      .getByRole("button", {
        name: approved ? "Aprovar" : "Reprovar",
        exact: true,
      })
      .click();
    const confirm = dialog.getByRole("button", {
      name: approved ? "Confirmar aprovação" : "Confirmar reprovação",
      exact: true,
    });
    await expect(confirm).toBeDisabled();
    expect(writes).toHaveLength(0);
    const input = dialog.getByLabel(
      approved ? "Justificativa da aprovação" : "Justificativa da reprovação",
    );
    await input.fill(" ");
    await expect(confirm).toBeDisabled();
    const reason = approved
      ? "De acordo com a proposta e o prazo."
      : "Revisar o orçamento para nova tratativa.";
    await input.fill(reason);
    await confirm.click();
    await expect(
      dialog.getByText(
        approved
          ? "Aprovada · De acordo para seguir com o processo"
          : "Reprovada · Devolvida ao solicitante",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(dialog.getByText(reason, { exact: true })).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ decision, reason });
  });

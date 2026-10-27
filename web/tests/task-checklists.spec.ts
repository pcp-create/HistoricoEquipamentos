import { test, expect } from "@playwright/test";
test("task checklist creates lists and items, completes to the bottom and reopens", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "m8-access", value: "test", domain: "localhost", path: "/" },
  ]);
  const task = {
    id: "1",
    title: "Teste de lista",
    source_key: "manual:1",
    status: "in_progress",
    priority: "normal",
  };
  await page.route("**/api/activity", (r) => r.fulfill({ json: {} }));
  await page.route("**/api/task-stages", (r) =>
    r.fulfill({ json: { stages: [] } }),
  );
  await page.route("**/api/tasks/reminders**", (r) =>
    r.fulfill({ json: { reminders: [] } }),
  );
  await page.route("**/api/tasks?id=1", (r) =>
    r.fulfill({
      json: { task, notes: [], attachments: [], notifications: [] },
    }),
  );
  await page.route("**/api/tasks", (r) =>
    r.fulfill({ json: { tasks: [task], users: [] } }),
  );
  let lists: any[] = [];
  let rejectToggle = false;
  let releaseToggle: (() => void) | undefined;
  let delayToggle = false;
  await page.route("**/api/tasks/checklists**", async (r) => {
    if (r.request().method() === "POST") {
      const b = r.request().postDataJSON();
      if (b.action === "create_list")
        lists.push({ id: b.id, title: b.title, items: [] });
      if (b.action === "add_item")
        lists
          .find((l) => l.id === b.listId)
          .items.push({
            id: b.id,
            title: b.title,
            completed: false,
            version: 1,
          });
      if (b.action === "delete_list") lists = lists.filter(l => l.id !== b.id);
      if (b.action === "rename_list") lists.find(l => l.id === b.id).title = b.title;
      if (b.action === "edit_item") {
        const item = lists.flatMap(l => l.items).find(i => i.id === b.id);
        item.title = b.title; item.version++;
      }
      if (b.action === "delete_item") lists.forEach(l => l.items = l.items.filter((i: any) => i.id !== b.id));
      if (b.action === "toggle") {
        if (delayToggle) await new Promise<void>(resolve => { releaseToggle = resolve; });
        if (rejectToggle) return r.fulfill({status: 500, json: {error: "Falha ao salvar"}});
        const item = lists.flatMap((l) => l.items).find((i) => i.id === b.id);
        item.completed = b.completed;
        item.version++;
      }
    }
    return r.fulfill({ json: { lists } });
  });
  await page.goto("/tarefas?task=1");
  const block = page.getByRole("region", { name: "Lista de verificação" });
  await block.getByRole("button", { name: "Criar lista", exact: true }).click();
  await block.getByLabel("Nome da lista").fill("Preparação");
  await block.getByRole("button", { name: "Salvar lista" }).click();
  await expect(block).toBeVisible();
  expect(await block.evaluate(el=>el.previousElementSibling?.querySelector('h3')?.textContent)).toBe('Informações da tarefa');
  const add=block.getByRole('button',{name:'Adicionar item em Preparação'});
  await expect(block.getByLabel('Novo item de Preparação')).toHaveCount(0);
  for(const item of ['Conferir dados','Visitar cliente']){
    await add.click();
    const input=block.getByLabel('Novo item de Preparação');
    await expect(input).toBeFocused();
    await input.fill(item);
    await input.press('Enter');
    await expect(input).toHaveCount(0);
    await expect(add).toBeFocused();
  }
  await add.click();
  await block.getByLabel('Novo item de Preparação').fill('Cancelar este item');
  await block.getByLabel('Novo item de Preparação').press('Escape');
  await expect(block.getByLabel('Novo item de Preparação')).toHaveCount(0);
  await expect(add).toBeVisible();
  await expect(page.locator('.task-drawer')).toBeVisible();
  await expect(block.locator('li')).toHaveCount(2);
  const style=await block.getByRole('button',{name:'Concluir item: Conferir dados',exact:true}).evaluate(el=>({border:getComputedStyle(el).borderTopWidth,background:getComputedStyle(el).backgroundColor}));
  expect(style).toEqual({border:'0px',background:'rgba(0, 0, 0, 0)'});
  expect(await block.locator('li').nth(1).evaluate(el=>getComputedStyle(el).borderTopWidth)).toBe('1px');
  await block
    .getByRole("button", { name: "Concluir item: Conferir dados", exact: true })
    .click();
  await expect(block.locator("li").last()).toContainText("Conferir dados");
  await expect(block.locator("li").last()).toHaveClass("is-completed");
  await expect(block.getByLabel("Progresso da lista")).toHaveText(
    "1/2 concluídos",
  );
  await page.reload();
  await expect(
    block.getByRole("button", { name: "Marcar como pendente: Conferir dados" }),
  ).toBeVisible();
  await block
    .getByRole("button", { name: "Marcar como pendente: Conferir dados" })
    .click();
  await expect(block.getByLabel("Progresso da lista")).toHaveText(
    "0/2 concluídos",
  );
  await expect(block.getByRole("button", {name: "Editar item: Conferir dados", exact: true})).toBeEnabled();
  await block.getByRole("button", {name: "Editar item: Conferir dados", exact: true}).click();
  await block.getByLabel("Editar título do item").fill("Conferir cadastro");
  await block.getByRole("button", {name: "Salvar item", exact: true}).click();
  await expect(block.getByText("Conferir cadastro", {exact: true})).toBeVisible();
  delayToggle = true; rejectToggle = true;
  await block.getByRole("button", {name: "Concluir item: Conferir cadastro", exact: true}).click();
  await expect(block.getByLabel("Progresso da lista")).toHaveText("1/2 concluídos");
  await expect.poll(() => !!releaseToggle).toBe(true);
  releaseToggle!();
  await expect(block.getByRole("alert")).toContainText("Falha ao salvar");
  await expect(block.getByLabel("Progresso da lista")).toHaveText("0/2 concluídos");
  page.once("dialog", d => d.accept());
  await block.getByRole("button", {name: "Remover item: Conferir cadastro", exact: true}).click();
  await expect(block.locator("li")).toHaveCount(1);
  const pencil = block.getByRole("button", {name:"Editar título: Preparação",exact:true});
  await block.getByRole("heading", {name:"Preparação",exact:true}).hover();
  await expect(pencil).toHaveCSS("opacity", "1");
  await expect(pencil).toHaveCSS("border-top-width", "0px");
  await expect(pencil).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await pencil.click();
  await block.getByLabel("Título da lista", {exact:true}).fill("Etapas revisadas");
  await block.getByRole("button", {name:"Salvar título da lista",exact:true}).click();
  await expect(block.getByRole("heading", {name:"Etapas revisadas",exact:true})).toBeVisible();
  await page.reload();
  await expect(block.getByRole("heading", {name:"Etapas revisadas",exact:true})).toBeVisible();
  await block.getByRole("heading", {name:"Etapas revisadas",exact:true}).hover();
  await block.getByRole("button", {name:"Editar título: Etapas revisadas",exact:true}).click();
  page.once("dialog", d => d.dismiss());
  await block.getByRole("button", {name:"Excluir lista",exact:true}).click();
  await expect(block.getByLabel("Título da lista", {exact:true})).toBeVisible();
  page.once("dialog", d => d.accept());
  await block.getByRole("button", {name:"Excluir lista",exact:true}).click();
  await expect(block.locator(".task-checklist")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page
      .locator(".task-drawer")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
});

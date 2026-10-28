import { test, expect } from '@playwright/test';

for (const fails of [false, true]) {
  test(`persisted tasks appear before synchronization finishes (fails=${fails})`, async ({ page, context }) => {
    await context.addCookies([{ name: 'm8-access', value: 'test', domain: 'localhost', path: '/' }]);
    await page.route('**/api/activity', r => r.fulfill({ json: {} }));
    await page.route('**/api/task-stages', r => r.fulfill({ json: { stages: [] } }));
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let syncing = false, finished = false;
    await page.route('**/api/tasks', async r => {
      if (r.request().method() === 'POST') {
        syncing = true;
        await gate;
        finished = true;
        return r.fulfill({ status: fails ? 503 : 200, json: fails ? { error: 'Sincronização indisponível' } : {} });
      }
      return r.fulfill({ json: { email: 'seller@test.com', users: [], tasks: [{ id: '1', title: finished && !fails ? 'Tarefa atualizada' : 'Tarefa já gravada', status: 'not_started', priority: 'normal', source_key: 'manual:1' }] } });
    });
    try {
      await page.goto('/tarefas');
      await expect(page.locator('.task-kanban-card')).toContainText('Tarefa já gravada');
      await expect.poll(() => syncing).toBe(true);
      expect(finished).toBe(false);
      release();
      if (fails) {
        await expect(page.getByText('Sincronização indisponível', { exact: true })).toBeVisible();
        await expect(page.locator('.task-kanban-card')).toContainText('Tarefa já gravada');
      } else {
        await expect(page.locator('.task-kanban-card')).toContainText('Tarefa atualizada');
      }
    } finally {
      release();
    }
  });
}

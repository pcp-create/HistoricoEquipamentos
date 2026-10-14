import { test, expect } from "@playwright/test";

test.skip(!process.env.M8_ROLLOUT_TESTS, "Requires dedicated enabled admin/user test sessions.");
for (const admin of [false, true]) test(`${admin ? "admin" : "user"} can open scheduling and technician modules`, async ({ page, context }) => {
  await context.addCookies([{ name: "m8-access", value: (admin ? process.env.M8_TEST_ADMIN_TOKEN : process.env.M8_TEST_USER_TOKEN) || "invalid", domain: "localhost", path: "/" }]);
  await page.goto("/");
  for (const label of ["Programação de OSs", "Portal Técnico"])
    await expect(page.getByRole("link", { name: new RegExp(label) })).toBeVisible();
  for (const path of ["/api/field", "/api/service-scheduling"])
    expect((await context.request.get(path)).status()).toBe(200);
});

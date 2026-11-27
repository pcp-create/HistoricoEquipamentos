import { test } from "node:test";
import { build } from "esbuild";
import { createServer } from "node:http";
import { chromium, expect } from "@playwright/test";

for (const state of ["reviewed", "sent"]) test(`delivery chooser supports WhatsApp and manual confirmation in ${state}`, async () => {
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: "tsx",
      contents: `import React from 'react';import{createRoot}from'react-dom/client';import Delivery from './components/crm-proposal-delivery';createRoot(document.getElementById('root')).render(<Delivery proposal={{id:'p',number:1,version:1,workflow:{state:new URLSearchParams(location.search).get('state')||'reviewed'}}} onEmail={()=>window.email=true} onClose={()=>window.closedDialog=true} onSent={async()=>{window.sent=true}}/>);`,
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    plugins: [
      {
        name: "mock",
        setup(b) {
          b.onResolve({ filter: /^\.\/crm-api$/ }, () => ({
            path: "api",
            namespace: "mock",
          }));
          b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
            contents: `export async function crmApi(q,b){window.calls.push(b);return b.action==='prepare-external-delivery'?{deliveryId:'delivery',filename:'Proposta-1.pdf',pdf:'JVBERi0xLjQ='}:{};}`,
            loader: "js",
          }));
        },
      },
    ],
  });
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<div id="root"></div><script>window.calls=[];window.open=(url)=>{window.openedUrl=url;return null;};</script><script>' +
        bundle.outputFiles[0].text +
        "</script>",
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:" + (server.address() as any).port + "?state=" + state);
    await expect(
      page.getByRole("button", { name: /Enviar via e-mail/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Enviar via WhatsApp/ }).click();
    await expect(
      page.getByText("PDF preparado:", { exact: false }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => (window as any).calls.length))
      .toBe(1);
    await expect(
      page.getByRole("button", { name: "Já enviei pelo WhatsApp" }),
    ).toBeDisabled();
    await expect(page.getByLabel("Mensagem para o cliente")).toHaveValue(/Segue nossa proposta comercial/);
    await page.getByLabel("Mensagem para o cliente").fill("Olá! Proposta revisada para sua avaliação.");
    await page.getByRole("button", { name: "Abrir WhatsApp" }).click();
    expect(new URL(await page.evaluate(() => (window as any).openedUrl)).searchParams.get("text")).toBe("Olá! Proposta revisada para sua avaliação.");
    await expect
      .poll(() => page.evaluate(() => (window as any).openedUrl))
      .toContain("https://wa.me/");
    await expect
      .poll(() => page.evaluate(() => (window as any).sent === true))
      .toBe(false);
    await page.getByRole("button", { name: "Já enviei pelo WhatsApp" }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).sent))
      .toBe(true);
    await page.reload();
    await page.getByRole("button", { name: /Proposta já enviada/ }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).sent))
      .toBe(true);
    expect(
      await page.evaluate(() =>
        (window as any).calls.map((b: any) => b.action),
      ),
    ).toEqual(["prepare-external-delivery", "confirm-external-delivery"]);
    expect(await page.evaluate(() => (window as any).calls[0].channel)).toBe(
      "manual",
    );
    expect(
      await page.evaluate(() => (window as any).openedUrl),
    ).toBeUndefined();
  } finally {
    await browser.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

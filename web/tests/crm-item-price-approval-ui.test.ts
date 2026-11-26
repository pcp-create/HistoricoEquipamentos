import { test } from "node:test";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
test("item approval sits below unit price, respects role and disappears when the value changes", async () => {
  const result = await build({
    stdin: {
      contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Items from './components/crm-proposal-items';import{itemPriceKey}from'./lib/crm/item-price-key';
 function App(){const[manager,setManager]=useState(false),[approvals,setApprovals]=useState([]),[items,setItems]=useState([{kind:'material',code:'50',name:'Filtro de óleo',quantity:'1',price:'400',quote:{key:'p:1:50:UN',kind:'material',code:'50',name:'Filtro de óleo',unit:'UN',quantity:'1',price:'400',selected:true,source:'Base geral',referencePrice:'600',minimumPrice:'500',lastPrice:'',referenceAt:''}}]);const draft={company:'1',customer:'',items};return <main className="new-os"><button onClick={()=>setManager(true)}>Perfil gestor</button><Items active draft={draft} kind="material" customer="" equipment="" company="1" items={items} onChange={setItems} disabled={false} canApprove={manager} approvals={approvals} onApprove={async()=>setApprovals([{item_key:itemPriceKey(draft,items[0]),minimum_price:500,approved_name:'Maria Coordenadora',approved_at:'2026-11-26T18:30:00Z'}])}/></main>};createRoot(document.getElementById('root')).render(<App/>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    define: { "process.env": "{}" },
    bundle: true,
    write: false,
    jsx: "automatic",
    outdir: "out",
    loader: { ".css": "empty" },
  });
  const js = result.outputFiles.find((f) => f.path.endsWith(".js"))!.text;
  const css =
    readFileSync("app/globals.css", "utf8") +
    readFileSync("components/crm.css", "utf8") +
    readFileSync("app/form-controls.css", "utf8");
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(`<style>${css}</style><div id="root"></div><script>${js}</script>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1150, height: 800 },
    });
    page.on("pageerror", (e) => console.error(e));
    await page.goto("http://127.0.0.1:" + (server.address() as any).port);
    const approve = page.getByRole("button", {
      name: "Aprovar abaixo do mínimo",
      exact: true,
    });
    await expect(approve).toBeDisabled();
    await page.getByRole("button", { name: "Perfil gestor" }).click();
    await expect(approve).toBeEnabled();
    const input = page.getByRole("textbox", {
      name: "Valor unitário (R$)",
      exact: true,
    });
    const inputBox = await input.boundingBox(),
      buttonBox = await approve.boundingBox();
    expect(buttonBox!.y).toBeGreaterThan(inputBox!.y);
    mkdirSync("/tmp/crm-item-approval", { recursive: true });
    await page.screenshot({ path: "/tmp/crm-item-approval/button.png" });
    await approve.click();
    await expect(
      page.getByText("Aprovado por Maria Coordenadora em", { exact: false }),
    ).toContainText("15:30");
    await expect(approve).toHaveCount(0);
    await page.screenshot({ path: "/tmp/crm-item-approval/approved.png" });
    await input.focus();
    await input.press("ControlOrMeta+A");
    await input.pressSequentially("390,00");
    await input.blur();
    await expect(approve).toBeEnabled();
    await expect(
      page.getByText("Aprovado por Maria Coordenadora em", { exact: false }),
    ).toHaveCount(0);
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

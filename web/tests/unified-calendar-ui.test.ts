import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { chromium, expect } from "@playwright/test";
const events = [
  {
    id: "operation:op1",
    source: "operations",
    sourceId: "op1",
    day: "2026-11-18",
    time: "08:00",
    title: "OS 15243 · Operação 01",
    customer: "Cliente técnico",
    description: "Manutenção",
    status: "executing",
    state: "pending",
    href: "/tecnico?operation=op1",
  },
  {
    id: "visit:v1",
    source: "visits",
    sourceId: "v1",
    day: "2026-11-18",
    time: "14:00",
    title: "Apresentação comercial",
    customer: "Lead comercial",
    description: "Visita",
    status: "completed",
    state: "completed",
    href: "/visitas?visit=v1",
  },
  {
    id: "task:42",
    source: "tasks",
    sourceId: "42",
    day: "2026-11-18",
    time: "",
    title: "TAR-42 · Retorno",
    customer: "Cliente técnico",
    description: "Orçamento",
    status: "not_started",
    state: "pending",
    href: "/tarefas?task=42",
  },
  {
    id: "visit:v2",
    source: "visits",
    sourceId: "v2",
    day: "2026-11-19",
    time: "10:00",
    title: "Visita cancelada",
    customer: "Outro cliente",
    description: "",
    status: "cancelled",
    state: "cancelled",
    href: "/visitas?visit=v2",
  },
];
async function harness(contents: string) {
  const compiled = await build({
    stdin: { contents, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true,
    write: false,
    jsx: "automatic",
    outdir: "out",
    loader: { ".png": "dataurl" },
    plugins: [
      {
        name: "navigation",
        setup(b) {
          b.onResolve(
            { filter: /^(next\/link|next\/navigation|\.\/site-header)$/ },
            (args) => ({ path: args.path, namespace: "mock" }),
          );
          b.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
            contents:
              args.path === "next/link"
                ? `import React from 'react';export default p=>React.createElement('a',p,p.children)`
                : args.path === "next/navigation"
                  ? `export const useSearchParams=()=>new URLSearchParams();export const usePathname=()=>'/visitas';export const useRouter=()=>({push(){},replace(){},refresh(){}});`
                  : "export default ()=>null",
            loader: "js",
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
  });
  const requests: string[] = [];
  let unavailable = false;
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/api/")) {
      res.setHeader("Content-Type", "application/json");
      if (req.url.startsWith("/api/calendar")) {
        requests.push(req.url);
        if(unavailable){res.statusCode=503;res.end(JSON.stringify({error:"Calendário indisponível no teste"}));return;}
        const url = new URL(req.url, "http://test");
        res.end(
          JSON.stringify({
            events: events.filter(
              (e) =>
                e.day >= url.searchParams.get("start")! &&
                e.day <= url.searchParams.get("end")!,
            ),
            updatedAt: "2026-11-18T16:00:00Z",
          }),
        );
      } else if (req.url === "/api/visits")
        res.end(
          JSON.stringify({
            name: "Técnico vendedor",
            customers: [
              {
                key: "lead:1",
                name: "Lead comercial",
                city: "Lages",
                uf: "SC",
                lead: true,
                health: "current",
                equipment: [],
              },
            ],
            visits: [
              {
                id: "v1",
                customer_key: "lead:1",
                seller: "dual@test",
                status: "completed",
                scheduled_at: "2026-11-18T14:00:00-03:00",
                completed_at: "2026-11-18T15:00:00-03:00",
                contact: "Contato",
                phone: "47999999999",
                description: "Visita",
                outcome: "Concluída",
                version: 1,
              },
            ],
            purposes: [],
            sellers: [],
          }),
        );
      else if (req.url === "/api/field")
        res.end(
          JSON.stringify({
            email: "dual@test",
            displayName: "Técnico vendedor",
            rows: [],
            calendarRows: [],
            active: null,
          }),
        );
      else res.end("{}");
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial}${compiled.outputFiles.find((f) => f.path.endsWith(".css"))!.text}</style><div id="root"></div><script>${compiled.outputFiles.find((f) => f.path.endsWith(".js"))!.text}</script>`,
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    requests,
    failCalendar:()=>{unavailable=true;},
    url: "http://127.0.0.1:" + (server.address() as any).port,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
test("integrated calendar filters all modules, changes period, opens source records and fits a mobile screen", async () => {
  const app = await harness(
    `import React from 'react';import{createRoot}from'react-dom/client';import Calendar from './components/unified-calendar';import './components/service-scheduling.css';import './components/field-app.css';createRoot(document.getElementById('root')).render(<main className="scheduling-page field-app"><Calendar/></main>);`,
  );
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await page.clock.setFixedTime(new Date("2026-11-18T16:00:00Z"));
    await page.goto(app.url);
    const calendar = page.getByRole("region", { name: "Calendário integrado" });
    await expect(calendar.getByRole("article")).toHaveCount(3);
    await expect(
      calendar
        .getByRole("article")
        .filter({ hasText: "OS 15243" })
        .getByRole("link", { name: "Abrir" }),
    ).toHaveAttribute("href", "/tecnico?operation=op1");
    await calendar
      .getByRole("button", { name: "Visitas", exact: true })
      .click();
    await expect(calendar.getByRole("article")).toHaveCount(1);
    await calendar
      .getByLabel("Situação dos eventos", { exact: true })
      .selectOption("pending");
    await expect(calendar.getByRole("article")).toHaveCount(0);
    await calendar
      .getByLabel("Situação dos eventos", { exact: true })
      .selectOption("all");
    await calendar.getByRole("button", { name: "Todos", exact: true }).click();
    await calendar.getByLabel("Pesquisar", { exact: true }).fill("ORCAMENTO");
    await expect(calendar.getByRole("article")).toHaveCount(1);
    await expect(calendar.getByRole("article")).toContainText("TAR-42");
    await calendar.getByLabel("Pesquisar", { exact: true }).fill("");
    await calendar.getByRole("button", { name: "Semana", exact: true }).click();
    await expect(calendar.getByRole("article")).toHaveCount(4);
    await calendar.getByRole("button", { name: "Dia", exact: true }).click();
    await expect(calendar.getByRole("article")).toHaveCount(3);
    await calendar.getByLabel("Ir para a data").fill("2026-11-19");
    await expect(calendar.getByRole("article")).toHaveCount(1);
    await calendar.getByRole("button", { name: "Mês", exact: true }).click();
    await expect(
      calendar.getByRole("button", {
        name: "18/11/2026: 3 eventos",
        exact: true,
      }),
    ).toBeVisible();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: "/tmp/unified-calendar-mobile.png",
      fullPage: true,
    });
    app.failCalendar();
    await calendar.getByRole('button',{name:'Atualizar calendário'}).click();
    await expect(page.getByRole('alert')).toContainText('Calendário indisponível no teste');
    await expect(calendar.getByRole('article')).toHaveCount(1);
    assert.ok(
      app.requests.some(
        (u) => u.includes("start=2026-11-15") && u.includes("end=2026-11-21"),
      ),
    );
  } finally {
    await browser.close();
    await app.close();
  }
});
test("seller and technician portals both display cross-module events even when no OS is assigned", async () => {
  const app = await harness(
    `import React from 'react';import{createRoot}from'react-dom/client';import Field from './components/field-app';import Sales from './components/sales-visits';createRoot(document.getElementById('root')).render(location.pathname==='/tecnico'?<Field/>:<Sales/>);`,
  );
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.clock.setFixedTime(new Date("2026-11-18T16:00:00Z"));
    await page.goto(app.url + "/tecnico");
    await page.getByRole("button", { name: /Programação Sua agenda/ }).click();
    await page.getByRole("button", { name: "Calendário", exact: true }).click();
    const calendar = page.getByRole("region", { name: "Calendário integrado" });
    await expect(calendar.getByRole("article")).toHaveCount(3);
    await expect(calendar).toContainText("Lead comercial");
    await expect(calendar).toContainText("TAR-42");
    await page.goto(app.url + "/visitas");
    await page.getByRole("button", { name: /Visitas Sua carteira/ }).click();
    await page.getByRole("button", { name: "Calendário", exact: true }).click();
    await expect(calendar).toContainText("OS 15243");
    await expect(calendar).toContainText("TAR-42");
    await expect(calendar.locator(".sales-visit-row")).toHaveCount(1);
    await calendar.locator(".sales-visit-row summary").click();
    await expect(calendar.getByText("Contato", { exact: false })).toBeVisible();
  } finally {
    await browser.close();
    await app.close();
  }
});

test('task module keeps its authorized team filters while sharing the personal operations and visits',async()=>{
 const teamTask={...events[2],id:'task:77',sourceId:'77',title:'TAR-77 · Tarefa da equipe'};
 const app=await harness(`import React from 'react';import{createRoot}from'react-dom/client';import Calendar from './components/unified-calendar';createRoot(document.getElementById('root')).render(<Calendar initialSource="tasks" taskEvents={${JSON.stringify([teamTask])}}/>);`);
 const browser=await chromium.launch();try{const page=await browser.newPage();await page.clock.setFixedTime(new Date('2026-11-18T16:00:00Z'));await page.goto(app.url);const calendar=page.getByRole('region',{name:'Calendário integrado'});
 await expect(calendar.getByRole('article')).toHaveCount(1);await expect(calendar).toContainText('Tarefa da equipe');await expect(calendar).not.toContainText('TAR-42');
 await calendar.getByRole('button',{name:'Todos',exact:true}).click();await expect(calendar.getByRole('article')).toHaveCount(3);await expect(calendar).toContainText('OS 15243');await expect(calendar).toContainText('Lead comercial');
 }finally{await browser.close();await app.close();}
});

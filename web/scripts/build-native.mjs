import { build } from "esbuild";
import { readFile, writeFile, mkdir, rm, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(root, "../android/app/build/generated/portalAssets");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const core = (
  await readFile(path.join(root, "public/field-offline/sw.js"), "utf8")
).replace('importScripts("/field-offline/project.js");', "");
const project = await readFile(
  path.join(root, "public/field-offline/project.js"),
  "utf8",
);
const runtime = (
  await readFile(path.join(root, "native/runtime.js"), "utf8")
).replace("/* INSERT_OFFLINE_CORE */", project + "\n" + core);
await build({
  stdin: { contents: runtime, loader: "js", resolveDir: root },
  outfile: path.join(out, "runtime.js"),
  bundle: true,
  minify: true,
  target: "chrome100",
  platform: "browser",
});
await build({
  absWorkingDir: root,
  entryPoints: ["native/entry.tsx"],
  outdir: out,
  entryNames: "app",
  assetNames: "assets/[name]-[hash]",
  bundle: true,
  minify: true,
  target: "chrome100",
  platform: "browser",
  jsx: "automatic",
  loader: { ".woff": "file", ".woff2": "file", ".png": "file", ".svg": "file" },
  publicPath: "/native/",
  define: { "process.env.NODE_ENV": '"production"' },
});
await copyFile(
  path.join(root, "public/logo-rj.png"),
  path.join(out, "logo-rj.png"),
);
await writeFile(
  path.join(out, "index.html"),
  '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#246397"><title>Portal Técnico RJ</title><link rel="stylesheet" href="/native/app.css"></head><body><div id="root"><p>Carregando Portal Técnico RJ…</p></div><script src="/native/runtime.js"></script><script src="/native/app.js"></script></body></html>',
);
console.log("Interface local gerada em " + out);

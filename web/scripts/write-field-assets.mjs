import { readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(process.env.NEXT_DIST_DIR || ".next", "static");
const files = [];
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (/\.(js|css|woff2?|png|svg)$/.test(entry.name))
      files.push(
        "/_next/static/" + path.relative(root, file).split(path.sep).join("/"),
      );
  }
}
await scan(root);
await mkdir("public/field-offline", { recursive: true });
await writeFile(
  "public/field-offline/assets.json",
  JSON.stringify({ builtAt: new Date().toISOString(), files }),
);
console.log("Offline interface manifest: " + files.length + " assets.");

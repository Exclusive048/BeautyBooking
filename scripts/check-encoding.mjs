import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const roots = ["src", "scripts", "prisma", "openapi"];
const allowed = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".prisma", ".sql"]);

function hasBom(path) {
  const bytes = readFileSync(path);
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

function walk(dir, out) {
  const stats = statSync(dir);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(dir)) {
      walk(join(dir, entry), out);
    }
    return;
  }
  const ext = extname(dir);
  if (allowed.has(ext)) {
    out.push(dir);
  }
}

const files = [];
for (const root of roots) {
  if (!existsSync(root)) continue;
  walk(root, files);
}

const bad = files.filter((file) => hasBom(file));
if (bad.length > 0) {
  for (const file of bad) {
    console.error(file);
  }
  process.exit(1);
}

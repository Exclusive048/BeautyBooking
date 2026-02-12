import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const targets = [
  "src",
  "prisma/schema.prisma",
  "prisma/migrations",
  "README.md",
  "scripts",
];

const allowedExt = new Set([".ts", ".tsx", ".mjs", ".sql", ".md", ".prisma"]);

function hasBom(path) {
  const bytes = readFileSync(path);
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

function isTargetFile(path) {
  if (path.endsWith("schema.prisma")) return true;
  const ext = extname(path);
  return allowedExt.has(ext);
}

function walk(path, out) {
  const stats = statSync(path);
  if (stats.isDirectory()) {
    const entries = readdirSync(path);
    for (const entry of entries) {
      walk(join(path, entry), out);
    }
    return;
  }
  if (isTargetFile(path)) {
    out.push(path);
  }
}

const files = [];
for (const target of targets) {
  walk(target, files);
}

const bomFiles = files.filter((file) => hasBom(file));

if (bomFiles.length > 0) {
  console.error("BOM detected:");
  for (const file of bomFiles) {
    console.error(file);
  }
  process.exit(1);
}

console.log("utf8-no-bom: ok");

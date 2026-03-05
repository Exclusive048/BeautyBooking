import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const roots = ["src", "public", "docs", "README.md"];
const allowed = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".css", ".scss", ".txt"]);

function isAllowedCyrillic(code) {
  return (
    code === 0x0401 ||
    code === 0x0451 ||
    (code >= 0x0410 && code <= 0x042f) ||
    (code >= 0x0430 && code <= 0x044f)
  );
}

function isSuspiciousChar(code) {
  if (code === 0xfffd) return true;
  if (code >= 0x80 && code <= 0x9f) return true;
  if (code >= 0x0400 && code <= 0x04ff && !isAllowedCyrillic(code)) return true;
  return false;
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
  if (allowed.has(ext) || dir.endsWith("README.md")) {
    out.push(dir);
  }
}

const files = [];
for (const root of roots) {
  if (!existsSync(root)) continue;
  walk(root, files);
}

const hits = [];
for (const file of files) {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    hits.push({ file, line: 0, text: `Failed to read: ${String(error)}` });
    continue;
  }

  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const ch of line) {
      if (isSuspiciousChar(ch.codePointAt(0))) {
        hits.push({ file, line: index + 1, text: line });
        break;
      }
    }
  });
}

if (hits.length > 0) {
  for (const hit of hits) {
    const prefix = hit.line > 0 ? `${hit.file}:${hit.line}:` : `${hit.file}:`;
    console.error(`${prefix}${hit.text}`);
  }
  process.exit(1);
}

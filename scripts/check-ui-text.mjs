import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOTS = [
  "src/features/public-profile",
  "src/features/public-studio",
  "src/features/booking",
  "src/features/reviews",
  "src/features/media",
  "src/features/schedule/components/schedule-builder.tsx",
  "src/features/admin/components/admin-billing.tsx",
  "src/features/admin/components/admin-settings.tsx",
  "src/features/master/components/master-advisor-section.tsx",
  "src/app/(public)/u/[username]/page.tsx",
];

const CYRILLIC_RE = /[А-Яа-яЁё]/;

function collectFiles(rootPath) {
  const fullPath = resolve(rootPath);
  const stat = statSync(fullPath);
  if (stat.isFile()) return [fullPath];

  const files = [];
  const stack = [fullPath];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const entryPath = resolve(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".tsx")) {
        files.push(entryPath);
      }
    }
  }
  return files;
}

const violations = [];

for (const root of ROOTS) {
  const files = collectFiles(root);
  for (const filePath of files) {
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!CYRILLIC_RE.test(line)) continue;
      violations.push({
        filePath,
        line: index + 1,
        text: line.trim().slice(0, 160),
      });
    }
  }
}

if (violations.length > 0) {
  console.error("UI text hardcode check failed. Move user-facing strings to src/lib/ui/text.ts");
  for (const violation of violations) {
    console.error(`${violation.filePath}:${violation.line} ${violation.text}`);
  }
  process.exit(1);
}

console.log("UI text hardcode check passed.");

import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOTS = [
  "src/features/public-profile",
  "src/features/public-studio",
  "src/features/booking",
  "src/features/reviews",
  "src/features/media",
  "src/app/(public)/u/[username]/page.tsx",
];

const CYRILLIC_RE = /[А-Яа-яЁё]/;

/**
 * Blank out comment content so Cyrillic prose inside comments (JSDoc, block,
 * line, and JSX `{/* * /}` comments) is not flagged as a hardcoded UI string.
 * Tracks `/* ... * /` across lines so block-comment continuation lines (which
 * don't start with `*`) are stripped too. Conservative on the false-NEGATIVE
 * side: a `//` or `/*` inside a string literal would over-strip, but a Cyrillic
 * UI string sitting after such a sequence on the same line is not a real pattern
 * in this codebase. Returns the code-only portion of each line.
 */
function stripComments(lines) {
  let inBlock = false;
  return lines.map((line) => {
    let out = "";
    let i = 0;
    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf("*/", i);
        if (end === -1) {
          i = line.length;
        } else {
          inBlock = false;
          i = end + 2;
        }
        continue;
      }
      const lineComment = line.indexOf("//", i);
      const blockStart = line.indexOf("/*", i);
      if (blockStart !== -1 && (lineComment === -1 || blockStart < lineComment)) {
        out += line.slice(i, blockStart);
        inBlock = true;
        i = blockStart + 2;
      } else if (lineComment !== -1) {
        out += line.slice(i, lineComment);
        i = line.length;
      } else {
        out += line.slice(i);
        i = line.length;
      }
    }
    return out;
  });
}

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
    const rawLines = content.split("\n");
    const codeLines = stripComments(rawLines);
    for (let index = 0; index < codeLines.length; index += 1) {
      // Test the comment-stripped code; report the original line for context.
      if (!CYRILLIC_RE.test(codeLines[index])) continue;
      violations.push({
        filePath,
        line: index + 1,
        text: rawLines[index].trim().slice(0, 160),
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

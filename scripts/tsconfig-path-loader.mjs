import { access } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const extensions = [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"];

async function fileExists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith("@/")) {
    const relativePath = specifier.slice(2);
    const basePath = path.resolve(projectRoot, "src", relativePath);
    if (path.extname(basePath)) {
      return defaultResolve(pathToFileURL(basePath).href, context);
    }
    for (const extension of extensions) {
      const candidate = `${basePath}${extension}`;
      if (await fileExists(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
    for (const extension of extensions) {
      const candidate = path.join(basePath, `index${extension}`);
      if (await fileExists(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }
  return defaultResolve(specifier, context);
}

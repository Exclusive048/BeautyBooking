import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const url = process.env.OPENAPI_URL || "http://localhost:3000/api/openapi";
const outPath = "openapi/openapi.json";
const timeoutMs = 2500;

function unreachableError(cause) {
  const error = new Error("UNREACHABLE");
  error.name = "FetchUnreachableError";
  error.cause = cause;
  return error;
}

async function fetchWithTimeout(targetUrl, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(targetUrl, { signal: controller.signal });
  } catch (error) {
    throw unreachableError(error);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  let res;
  try {
    res = await fetchWithTimeout(url, timeoutMs);
  } catch (error) {
    if (error instanceof Error && error.name === "FetchUnreachableError") {
      console.warn("openapi: skipped (server not reachable)");
      return;
    }
    throw error;
  }
  if (!res.ok) {
    throw new Error(`OpenAPI fetch failed: ${res.status}`);
  }
  const data = await res.json();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

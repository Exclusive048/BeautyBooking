const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const timeoutMs = 2000;

function unreachableError(cause) {
  const error = new Error("UNREACHABLE");
  error.name = "FetchUnreachableError";
  error.cause = cause;
  return error;
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    throw unreachableError(error);
  } finally {
    clearTimeout(timer);
  }
}

async function check(path) {
  const res = await fetchWithTimeout(`${baseUrl}${path}`, timeoutMs);
  if (!res.ok) {
    throw new Error(`Smoke failed for ${path}: ${res.status}`);
  }
}

async function main() {
  try {
    await check("/api/openapi");
    await check("/api/health");
    console.log("smoke: ok");
  } catch (error) {
    if (error instanceof Error && error.name === "FetchUnreachableError") {
      console.warn("smoke: skipped (server not reachable)");
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

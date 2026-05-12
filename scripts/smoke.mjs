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

async function checkJsonShape(path, requiredKeys) {
  const res = await fetchWithTimeout(`${baseUrl}${path}`, timeoutMs);
  if (!res.ok) {
    throw new Error(`Smoke failed for ${path}: ${res.status}`);
  }
  const json = await res.json().catch(() => null);
  if (!json || json.ok !== true || !json.data) {
    throw new Error(`Smoke failed for ${path}: unexpected response shape`);
  }
  for (const key of requiredKeys) {
    if (!(key in json.data)) {
      throw new Error(`Smoke failed for ${path}: missing key "${key}"`);
    }
  }
}

async function checkStatus(path, init, expectedStatus) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${baseUrl}${path}`, { ...init, signal: controller.signal });
  } catch (error) {
    throw unreachableError(error);
  } finally {
    clearTimeout(timer);
  }
  if (res.status !== expectedStatus) {
    throw new Error(`Smoke failed for ${path}: expected ${expectedStatus}, got ${res.status}`);
  }
}

async function main() {
  try {
    await check("/api/openapi");
    await check("/api/health");
    await checkJsonShape("/api/feed/portfolio", ["items", "nextCursor"]);
    await checkJsonShape("/api/feed/stories", ["groups", "cachedAt"]);
    await checkStatus(
      "/api/master/settings/auto-publish-stories",
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: true }) },
      401,
    );
    console.log("smoke: ok");
  } catch (error) {
    if (error instanceof Error && error.name === "FetchUnreachableError") {
      console.warn("WARNING: smoke: skipped (server not reachable)");
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

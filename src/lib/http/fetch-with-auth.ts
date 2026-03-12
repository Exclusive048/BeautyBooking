let isRefreshing = false;
let waitQueue: Array<(ok: boolean) => void> = [];

async function triggerRefresh(): Promise<boolean> {
  if (isRefreshing) {
    return new Promise((resolve) => waitQueue.push(resolve));
  }

  isRefreshing = true;
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    const ok = res.ok;
    waitQueue.forEach((resolve) => resolve(ok));
    waitQueue = [];
    return ok;
  } catch {
    waitQueue.forEach((resolve) => resolve(false));
    waitQueue = [];
    return false;
  } finally {
    isRefreshing = false;
  }
}

export async function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, { ...init, credentials: "include" });
  if (res.status !== 401) return res;

  const refreshed = await triggerRefresh();
  if (!refreshed) {
    if (typeof window !== "undefined") {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    return res;
  }

  return fetch(input, { ...init, credentials: "include" });
}

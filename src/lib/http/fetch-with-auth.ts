/**
 * Итог попытки обновить сессию.
 *
 * SESSION-LOSS-01 (2026-09-23): раньше итог был булевым, и ЛЮБОЙ неуспех —
 * включая обрыв сети и 503 страницы «идут работы» во время автодеплоя — уводил
 * на `/login`, хотя сессия была жива. Разлогинивать можно только по ответу
 * сервера «вход устарел» (401); всё остальное — временная недоступность: запрос
 * возвращается вызывающему как есть, куки не трогаются.
 */
type RefreshOutcome = "refreshed" | "unauthorized" | "unavailable";

let isRefreshing = false;
let waitQueue: Array<(outcome: RefreshOutcome) => void> = [];

function settle(outcome: RefreshOutcome): RefreshOutcome {
  waitQueue.forEach((resolve) => resolve(outcome));
  waitQueue = [];
  return outcome;
}

async function triggerRefresh(): Promise<RefreshOutcome> {
  if (isRefreshing) {
    return new Promise((resolve) => waitQueue.push(resolve));
  }

  isRefreshing = true;
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) return settle("refreshed");
    return settle(res.status === 401 ? "unauthorized" : "unavailable");
  } catch {
    return settle("unavailable");
  } finally {
    isRefreshing = false;
  }
}

export async function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, { ...init, credentials: "include" });
  if (res.status !== 401) return res;

  const outcome = await triggerRefresh();
  if (outcome === "unauthorized") {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- модуль без роутера; вход устарел, стейт прежней сессии сбрасывается
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    return res;
  }
  // Сеть или сервер временно недоступны — пользователь остаётся на месте,
  // вызывающий покажет свою ошибку, следующий запрос попробует снова.
  if (outcome === "unavailable") return res;

  return fetch(input, { ...init, credentials: "include" });
}

import { describe, expect, it, vi } from "vitest";

/**
 * FIX-D1 — РОУТ действительно возвращает браузер в кабинет.
 *
 * ## Почему этот файл существует отдельно от `oauth-start-cabinet-return.test.ts`
 *
 * 🔴 Найдено пробой, а не рассуждением. Тот файл проверяет хелперы
 * (`isCabinetReferer`, `oauthStartCabinetRedirect`) и то, что страница читает
 * `?vk=`. Правдоподобная регрессия — **вернуть в роуте
 * `oauthStartLoginRedirect`** — оставила его ПОЛНОСТЬЮ зелёным (8/8): хелпер
 * работает, страница потребляет, а роут их не связывает. Ровно тот класс, о
 * котором предупреждает правило «если корректный и дефектный пути дают один
 * видимый результат — утверждай ПУТЬ»: здесь видимого результата у юнитов не
 * было вовсе, потому что никто не спрашивал сам роут.
 *
 * Поэтому проверяется наблюдаемый ответ РОУТА: куда именно уходит `Location`.
 *
 * @probe   что сломать: в `api/auth/vk/start/route.ts` заменить
 *          `backToStartSurface(req, "provider_unavailable")` на
 *          `oauthStartLoginRedirect(req, "provider_unavailable")`.
 *          наблюдалось: «нажали из кабинета — возврат обязан быть в кабинет …
 *          получено /login?error=provider_unavailable» → красный.
 *          Восстановлено, зелено.
 */

const flags = vi.hoisted(() => ({ vk: false }));

vi.mock("@/lib/env", () => ({
  get isVkAuthEnabled() {
    return flags.vk;
  },
  isProduction: false,
  env: {},
}));
vi.mock("@/lib/http/origin", () => ({
  nextRedirect: (_req: Request, target: string) =>
    new Response(null, { status: 302, headers: { location: target } }),
}));
vi.mock("@/lib/api/with-request-context", () => ({
  withRequestContext: async (_req: Request, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: async () => null }));
vi.mock("@/lib/logging/logger", () => ({
  getRequestId: () => "req",
  logError: () => {},
  logInfo: () => {},
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: () => {}, get: () => undefined }) }));

const { GET } = await import("@/app/api/auth/vk/start/route");

function call(referer?: string) {
  return GET(
    new Request("https://app.test/api/auth/vk/start", {
      headers: referer ? { referer } : {},
    }),
  );
}

describe("FIX-D1 · /api/auth/vk/start возвращает туда, откуда нажали", () => {
  it("🔴 нажали из клиентского кабинета — возврат в кабинет с ?vk=", async () => {
    flags.vk = false; // килсвитч → исход `provider_unavailable` до любой работы
    const res = await call("https://app.test/cabinet/profile");

    expect(res.status).toBe(302);
    expect(
      res.headers.get("location"),
      "нажали из кабинета — возврат обязан быть в кабинет: уже вошедшего " +
        "пользователя нельзя отправлять на страницу входа",
    ).toBe("/cabinet/profile?vk=provider_unavailable");
  });

  it("нажали с /login — по-прежнему /login?error= (поведение не менялось)", async () => {
    flags.vk = false;
    const res = await call("https://app.test/login");

    expect(res.headers.get("location")).toBe("/login?error=provider_unavailable");
  });

  it("без Referer — /login, как и раньше", async () => {
    flags.vk = false;
    const res = await call();

    expect(res.headers.get("location")).toBe("/login?error=provider_unavailable");
  });
});

import { describe, expect, it, vi } from "vitest";

/**
 * FIX-D1 — отказ стартовой ноги возвращается ТУДА, откуда нажали.
 *
 * FIX-B14 построил механизм «вернуться на поверхность подключения с
 * `?vk=<исход>`» и оставил его внутри интеграционной ноги. Кнопка при этом
 * стоит в ДВУХ кабинетах, а клиентский профиль зовёт **auth**-ногу (для клиента
 * это связывание аккаунта, а не интеграция уведомлений провайдера) — и её отказ
 * уходил на `/login?error=…`, то есть уже вошедшего пользователя отправляли на
 * страницу входа.
 *
 * SMOKE-02 · Ф-1 намерил это со стороны страницы: параметр `?vk=` НЕ снимался с
 * адреса, потому что его туда никто не ставил.
 *
 * @probe   что сломать: в `api/auth/vk/start/route.ts` вернуть
 *          `oauthStartLoginRedirect(req, …)` вместо `backToStartSurface(req, …)`.
 *          наблюдалось: «кабинет обязан получить возврат на свою страницу …
 *          получено /login?error=provider_unavailable» → красный на первом тесте.
 *          Восстановлено, зелено.
 */

vi.mock("@/lib/http/origin", () => ({
  // Настоящий `nextRedirect` тянет env и `sanitizeInternalPath`; здесь предмет
  // проверки — ВЫБОР адреса, поэтому редирект сводится к наблюдаемому значению.
  nextRedirect: (_req: Request, target: string) =>
    new Response(null, { status: 302, headers: { location: target } }),
}));
vi.mock("@/lib/logging/logger", () => ({
  getRequestId: () => "req",
  logError: () => {},
  logInfo: () => {},
}));

const { isCabinetReferer, oauthStartCabinetRedirect, oauthStartLoginRedirect } = await import(
  "@/lib/auth/oauth-start-error"
);

function req(referer?: string): Request {
  return new Request("https://app.test/api/auth/vk/start", {
    headers: referer ? { referer } : {},
  });
}

describe("FIX-D1 · адрес отказа следует за кнопкой", () => {
  it("🔴 переход из кабинета распознаётся", () => {
    expect(isCabinetReferer(req("https://app.test/cabinet/profile"))).toBe(true);
    expect(isCabinetReferer(req("https://app.test/cabinet/studio/settings?section=notifications"))).toBe(
      true,
    );
  });

  it("переход с /login кабинетным НЕ считается — там /login и есть верный адрес", () => {
    expect(isCabinetReferer(req("https://app.test/login"))).toBe(false);
  });

  it("отсутствующий или битый Referer → не кабинет (прежнее поведение)", () => {
    expect(isCabinetReferer(req())).toBe(false);
    // ⚠️ Значение заголовка — ByteString: нелатинская строка не проходит уже в
    // конструкторе `Request`, поэтому «битый» фикстурой берём ASCII-мусор.
    expect(isCabinetReferer(req("not a url"))).toBe(false);
  });

  it("🔴 кабинетный возврат несёт исход в ?vk= и сохраняет исходный путь", () => {
    const res = oauthStartCabinetRedirect(
      req("https://app.test/cabinet/profile"),
      "provider_unavailable",
      "vk",
    );
    expect(
      res.headers.get("location"),
      "кабинет обязан получить возврат на свою страницу с исходом в параметре",
    ).toBe("/cabinet/profile?vk=provider_unavailable");
  });

  it("существующие параметры страницы не затираются", () => {
    const res = oauthStartCabinetRedirect(
      req("https://app.test/cabinet/studio/settings?section=notifications"),
      "start_failed",
      "vk",
    );
    expect(res.headers.get("location")).toBe(
      "/cabinet/studio/settings?section=notifications&vk=start_failed",
    );
  });

  it("без Referer — дефолтная поверхность подключения, а не корень", () => {
    const res = oauthStartCabinetRedirect(req(), "start_failed", "vk");
    expect(res.headers.get("location")).toBe("/cabinet/profile?vk=start_failed");
  });

  it("логин-нога по-прежнему ведёт на /login — её адрес не менялся", () => {
    const res = oauthStartLoginRedirect(req("https://app.test/login"), "consent_required");
    expect(res.headers.get("location")).toBe("/login?error=consent_required");
  });
});

describe("FIX-D1 · страница, на которой стоит кнопка, читает исход", () => {
  it("🔴 клиентский профиль потребляет ?vk=", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const { stripComments } = await import("@/lib/testing/source-scan");
    const source = stripComments(
      readFileSync(
        resolve(process.cwd(), "src/features/client-cabinet/profile/client-profile-page.tsx"),
        "utf8",
      ),
    );
    // Свойство, а не форма: страница обязана И прочитать параметр, И убрать его
    // из адреса (иначе обновление показывает уже показанный отказ повторно).
    expect(source, "страница не читает ?vk= — ровно это и намерил SMOKE-02 · Ф-1").toContain(
      'get("vk")',
    );
    // Снятие идёт общей чисткой адреса (та же, что у telegram-исхода): страница
    // проверяет ОБА флага и вызывает `replaceState`. Проверяем свойство —
    // «параметр учтён в чистке», — а не конкретную форму вызова.
    expect(source, "страница не снимает ?vk= с адреса").toContain('searchParams.get("vk")');
    expect(source, "страница не чистит адрес после показа отказа").toContain("replaceState");
  });
});

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * FIX-B14 · AUTH-RESPONSE-COHERENCE — стартовая нога OAuth отвечает навигацией
 * на КАЖДЫЙ свой исход.
 *
 * Решение владельца: исключений нет, включая `CONSENT_REQUIRED`. Обоснование
 * см. в `lib/auth/oauth-start-error.ts` — коротко: на колбэке «повторять
 * нечего» ещё можно выразить JSON'ом, а на старте пользователь физически
 * находится внутри навигации браузера, и любой конверт там — экран с сырым
 * JSON вместо сайта.
 *
 * Проверяются ОБА уровня, и это не дублирование:
 *   1. поведение — каждый исход даёт `Location` с ожидаемым ключом (статуса
 *      мало: 307 без адреса — это тот же тупик, только вежливый);
 *   2. полнота — ни один файл стартовой ноги не содержит вызова конверта
 *      вовсе. Набор файлов ВЫВОДИТСЯ из дерева (`**​/start/route.ts` внутри
 *      auth-семейств), поэтому новая стартовая нога наследует правило, а не
 *      добавляется в список руками.
 *
 * @probe   что сломать (поведение): вернуть в `api/auth/vk/start/route.ts`
 *          ветку `fail("Этот способ входа недоступен.", 503, "SERVICE_UNAVAILABLE")`
 *          вместо `oauthStartLoginRedirect(req, "provider_unavailable")`.
 *          наблюдалось: «vk/start · провайдер выключен килсвитчем → навигация
 *          на /login: expected null to contain "/login?error=provider_unavailable"»
 *          — падает первое утверждение и называет ногу и исход.
 *
 * @probe   что сломать (полнота): добавить в `api/auth/yandex/start/route.ts`
 *          любой `return fail("…", 500, "X");`.
 *          наблюдалось: «стартовые ноги, отвечающие конвертом вместо навигации:
 *          src/app/api/auth/yandex/start/route.ts:81 → return fail("…", 500, "X");»
 */

const flags = vi.hoisted(() => ({ vk: true, yandex: true }));
const spies = vi.hoisted(() => ({
  buildVkAuthorizeUrl: vi.fn(() => "https://vk.com/authorize?x=1"),
  buildYandexAuthorizeUrl: vi.fn(() => "https://oauth.yandex.ru/authorize?x=1"),
  requireVkRedirectUri: vi.fn(() => "https://app.example/cb"),
  requireYandexRedirectUri: vi.fn(() => "https://app.example/ya/cb"),
  getSessionUser: vi.fn(async () => null as unknown),
  logError: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  get isVkAuthEnabled() {
    return flags.vk;
  },
  get isYandexAuthEnabled() {
    return flags.yandex;
  },
  isProduction: false,
  env: { AUTH_JWT_SECRET: "x".repeat(64) },
}));

const cookieStore = { get: vi.fn(() => undefined), set: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: spies.getSessionUser }));
vi.mock("@/lib/logging/logger", () => ({
  logError: spies.logError,
  logInfo: vi.fn(),
  getRequestId: () => "req-1",
  // `withRequestContext` оборачивает обработчик — без этого экспорта роут падает
  // до первой проверки, и тест краснел бы по причине, к предмету не относящейся.
  withRequestId: <T,>(_id: string, handler: () => T) => handler(),
}));
vi.mock("@/lib/http/origin", () => ({
  nextRedirect: (_req: Request, target: string) =>
    new Response(null, { status: 307, headers: { location: target } }),
}));

vi.mock("@/lib/vk/oauth", () => ({
  buildVkAuthorizeUrl: spies.buildVkAuthorizeUrl,
  requireVkRedirectUri: spies.requireVkRedirectUri,
}));
vi.mock("@/lib/vk/pkce", () => ({ generateCodeChallenge: () => "c", generateCodeVerifier: () => "v" }));
vi.mock("@/lib/vk/cookies", () => ({
  signVkCookieValue: (v: string) => v,
  VK_ID_STATE_COOKIE: "vk_state",
  VK_ID_VERIFIER_COOKIE: "vk_ver",
  VK_ID_STATE_TTL_SECONDS: 600,
}));
vi.mock("@/lib/yandex/oauth", () => ({
  buildYandexAuthorizeUrl: spies.buildYandexAuthorizeUrl,
  requireYandexRedirectUri: spies.requireYandexRedirectUri,
}));
vi.mock("@/lib/yandex/pkce", () => ({ generateCodeChallenge: () => "c", generateCodeVerifier: () => "v" }));
vi.mock("@/lib/yandex/cookies", () => ({
  signYandexCookieValue: (v: string) => v,
  YANDEX_STATE_COOKIE: "y_state",
  YANDEX_VERIFIER_COOKIE: "y_ver",
  YANDEX_STATE_TTL_SECONDS: 600,
}));

import { AppError } from "@/lib/api/errors";
import { GET as vkStart } from "@/app/api/auth/vk/start/route";
import { GET as yandexStart } from "@/app/api/auth/yandex/start/route";

const CONSENTED = "?terms=1&pd=1&marketing=0";

function req(url: string) {
  return new Request(url);
}

/**
 * Первым падает утверждение, НАЗЫВАЮЩЕЕ дефект («это не навигация»), и только
 * потом сравнивается ключ исхода. Без него ответ-конверт ронял сравнение
 * `toContain(null, …)` — чеховская жалоба на типы, из которой не видно ни ноги,
 * ни того, что именно сломано (ровно этот промах словили в FIX-B13).
 */
function navigationTargetOf(res: Response, leg: string): string {
  const location = res.headers.get("location");
  expect(
    location,
    `${leg}: стартовая нога ответила НЕ навигацией — заголовка Location нет ` +
      `(status ${res.status}, content-type ${res.headers.get("content-type") ?? "—"}). ` +
      "Сюда приходит браузер: любой исход обязан кончиться страницей.",
  ).not.toBeNull();
  expect([302, 303, 307, 308], `${leg}: статус не редиректный`).toContain(res.status);
  return location as string;
}

beforeEach(() => {
  flags.vk = true;
  flags.yandex = true;
  vi.clearAllMocks();
  spies.getSessionUser.mockResolvedValue(null);
  spies.buildVkAuthorizeUrl.mockReturnValue("https://vk.com/authorize?x=1");
  spies.buildYandexAuthorizeUrl.mockReturnValue("https://oauth.yandex.ru/authorize?x=1");
  spies.requireVkRedirectUri.mockReturnValue("https://app.example/cb");
  spies.requireYandexRedirectUri.mockReturnValue("https://app.example/ya/cb");
});

describe("FIX-B14 — исходы стартовой ноги возвращают браузер на /login", () => {
  it("vk/start · провайдер выключен килсвитчем → навигация на /login", async () => {
    flags.vk = false;
    const res = await vkStart(req(`http://localhost/api/auth/vk/start${CONSENTED}`));
    expect(navigationTargetOf(res, "vk/start · килсвитч")).toContain(
      "/login?error=provider_unavailable",
    );
  });

  it("vk/start · согласия не отмечены → навигация на /login (исключений нет)", async () => {
    const res = await vkStart(req("http://localhost/api/auth/vk/start"));
    expect(navigationTargetOf(res, "vk/start · согласия")).toContain(
      "/login?error=consent_required",
    );
  });

  it("vk/start · провайдер не сконфигурирован → тот же исход, что у килсвитча", async () => {
    spies.requireVkRedirectUri.mockImplementation(() => {
      throw new AppError("VK redirect URI missing", 503, "VK_ID_REDIRECT_URI_MISSING");
    });
    const res = await vkStart(req(`http://localhost/api/auth/vk/start${CONSENTED}`));
    expect(navigationTargetOf(res, "vk/start · не сконфигурирован")).toContain(
      "/login?error=provider_unavailable",
    );
  });

  it("vk/start · прочий сбой → /login?error=start_failed, payload ошибки в тело не уезжает", async () => {
    spies.buildVkAuthorizeUrl.mockImplementation(() => {
      throw new AppError("boom", 500, "INTERNAL_ERROR", {
        access_token: "vk1.a.SUPER_SECRET_ACCESS_TOKEN_value",
      });
    });
    const res = await vkStart(req(`http://localhost/api/auth/vk/start${CONSENTED}`));
    expect(navigationTargetOf(res, "vk/start · прочий сбой")).toContain("/login?error=start_failed");
    expect(await res.text()).not.toContain("SUPER_SECRET_ACCESS_TOKEN_value");
    // Диагностика уезжает в лог, и уже скрабленной.
    const logged = JSON.stringify(spies.logError.mock.calls);
    expect(logged).toContain("INTERNAL_ERROR");
    expect(logged).not.toContain("SUPER_SECRET_ACCESS_TOKEN_value");
  });

  it("yandex/start · те же три исхода (нога-близнец не расходится)", async () => {
    flags.yandex = false;
    const disabled = await yandexStart(req(`http://localhost/api/auth/yandex/start${CONSENTED}`));
    expect(navigationTargetOf(disabled, "yandex/start · килсвитч")).toContain(
      "/login?error=provider_unavailable",
    );

    flags.yandex = true;
    const noConsent = await yandexStart(req("http://localhost/api/auth/yandex/start"));
    expect(navigationTargetOf(noConsent, "yandex/start · согласия")).toContain(
      "/login?error=consent_required",
    );

    spies.requireYandexRedirectUri.mockImplementation(() => {
      throw new AppError("missing", 503, "YANDEX_REDIRECT_URI_MISSING");
    });
    const unconfigured = await yandexStart(
      req(`http://localhost/api/auth/yandex/start${CONSENTED}`),
    );
    expect(navigationTargetOf(unconfigured, "yandex/start · не сконфигурирован")).toContain(
      "/login?error=provider_unavailable",
    );
  });

  it("успешный старт по-прежнему уходит к провайдеру (гейт не течёт в рабочий путь)", async () => {
    const res = await vkStart(req(`http://localhost/api/auth/vk/start${CONSENTED}`));
    expect(res.headers.get("location")).toContain("vk.com");
    expect(spies.buildVkAuthorizeUrl).toHaveBeenCalledOnce();
  });
});

// ── Полнота: набор стартовых ног выводится из дерева ────────────────────────

const API_ROOT = join(process.cwd(), "src", "app", "api");
const AUTH_FAMILIES = ["src/app/api/auth/", "src/app/api/integrations/", "src/app/api/telegram/"];
/** Конверт проекта в любой из двух его сигнатур. */
const ENVELOPE_CALL = /\breturn\s+(?:json)?[Ff]ail\(/;

function listStartRoutes(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listStartRoutes(full));
      continue;
    }
    if (entry !== "route.ts") continue;
    const rel = relative(process.cwd(), full).split(sep).join("/");
    if (!AUTH_FAMILIES.some((family) => rel.startsWith(family))) continue;
    if (!rel.endsWith("/start/route.ts")) continue;
    out.push(rel);
  }
  return out;
}

describe("FIX-B14 — ни одна стартовая нога не отвечает конвертом", () => {
  const startRoutes = listStartRoutes(API_ROOT);

  it("ноги найдены обходом дерева (проверка не вакуумна)", () => {
    expect(startRoutes).toEqual(
      expect.arrayContaining([
        "src/app/api/auth/vk/start/route.ts",
        "src/app/api/auth/yandex/start/route.ts",
        "src/app/api/integrations/vk/start/route.ts",
      ]),
    );
  });

  it("в теле стартовой ноги нет ни одного возврата конверта", () => {
    const offenders: string[] = [];
    for (const rel of startRoutes) {
      readFileSync(rel, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[^\n]*?\/\/.*$/gm, "")
        .split("\n")
        .forEach((line, index) => {
          if (ENVELOPE_CALL.test(line)) offenders.push(`${rel}:${index + 1} → ${line.trim()}`);
        });
    }
    expect(
      offenders,
      `стартовые ноги, отвечающие конвертом вместо навигации:\n${offenders.join("\n")}\n\n` +
        "Сюда приходит НАВИГАЦИЯ браузера: любой исход обязан кончиться страницей " +
        "(см. lib/auth/oauth-start-error.ts).",
    ).toEqual([]);
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * FIX-B5 (решение владельца: вариант B) — **адрес от OAuth это ЗАЯВКА, а не
 * владение**.
 *
 * Ни VK, ни Яндекс не отдают признака подтверждённости: у Яндекса в
 * документации только `emails` / `default_email` / `email` без поля
 * верификации, у VK ID — подтверждение АККАУНТА, а не адреса. Проставлять
 * `emailVerifiedAt` из строки, за которую никто не поручился, значило бы
 * ослабить инв. #41 изнутри — ровно то, против чего он и заведён.
 *
 * @probe   что сломать: (1) вернуть `fail(...)` вместо `nextRedirect` в ветке
 *          конфликта `failOAuthCallback`; (2) снять распознавание `P2002` в
 *          `toAppError`; (3) дописать `emailVerifiedAt: new Date()` в create
 *          любого из двух колбэков.
 *          наблюдалось: (1) «конфликт обязан возвращать редирект… 200/500»,
 *          (2) «P2002 обязан читаться как конфликт: expected 500 to be 409»,
 *          (3) «колбэк ... проставляет emailVerifiedAt — это вариант A».
 */

vi.mock("@/lib/logging/logger", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  getRequestId: vi.fn(() => "rid"),
}));

const { toAppError } = await import("@/lib/api/errors");
const { failOAuthCallback } = await import("@/lib/auth/oauth-callback-error");
const { canDeliverServiceEmail } = await import("@/lib/notifications/delivery");

/** Форма сырой ошибки Prisma: важен только `code` — импорт Prisma запрещён (PERF-11). */
const uniqueViolation = () =>
  Object.assign(new Error("Unique constraint failed on the fields: (`email`)"), {
    code: "P2002",
    clientVersion: "6.19.3",
  });

const req = () => new Request("https://masterryadom.ru/api/auth/vk/callback?code=x");

describe("1 · конфликт в колбэке возвращает пользователя в приложение, а не JSON", () => {
  it("отдаёт редирект на /login с разбираемой причиной", () => {
    const response = failOAuthCallback(req(), uniqueViolation());

    expect(
      response.status,
      `конфликт обязан возвращать редирект, получено ${response.status}`,
    ).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);

    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/login");
    expect(location).toContain("error=email_taken");
  });

  it("прочие отказы формы НЕ меняют — подмена редиректом прятала бы сбой", () => {
    const response = failOAuthCallback(req(), new Error("boom"));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("2 · toAppError узнаёт P2002", () => {
  it("нарушение уникальности читается как конфликт, а не как общий сбой", () => {
    const mapped = toAppError(uniqueViolation());
    expect(mapped.status, "P2002 обязан читаться как конфликт").toBe(409);
    expect(mapped.code).toBe("ALREADY_EXISTS");
  });

  it("пути, ловящие P2002 сами, не задеты: AppError проходит насквозь", async () => {
    const { AppError } = await import("@/lib/api/errors");
    const own = new AppError("Этот email уже используется другим аккаунтом.", 409, "EMAIL_ALREADY_USED");
    expect(toAppError(own)).toBe(own);
  });

  it("не-Prisma ошибка с чужим `code` конфликтом не считается", () => {
    const mapped = toAppError(Object.assign(new Error("x"), { code: "ENOTFOUND" }));
    expect(mapped.status).toBe(500);
  });
});

describe("3 · вариант B зафиксирован: OAuth-адрес не даёт ни отметки, ни писем", () => {
  it("профиль с адресом без подтверждения писем НЕ получает (поведение)", () => {
    expect(
      canDeliverServiceEmail({
        email: "from-vk@example.ru",
        emailNotificationsEnabled: true,
        emailVerifiedAt: null,
      }),
    ).toBe(false);
  });

  it("ни один колбэк не проставляет emailVerifiedAt (пин против дрейфа к варианту A)", () => {
    // ⚠️ Проверка ИСХОДНИКА, и это осознанно слабее поведенческой: рантайм-поверхности
    // у «колбэк не сделал запись» нет. Она ловит ровно тот дрейф, который вероятен, —
    // добавление поля в объект `data` при правке колбэка.
    const root = path.resolve(__dirname, "..", "..", "app", "api", "auth");
    for (const provider of ["vk", "yandex"]) {
      const source = readFileSync(path.join(root, provider, "callback", "route.ts"), "utf8");
      expect(
        source,
        `колбэк ${provider} проставляет emailVerifiedAt — это вариант A, ` +
          `он требует решения владельца и обработки коллизии (инв. #41)`,
      ).not.toMatch(/emailVerifiedAt/);
    }
    // MOBILE-AUTH-A2: создание/обновление пользователя по профилю провайдера
    // живёт в общем сервисе (веб и приложение) — пин распространяется на него.
    const service = readFileSync(path.resolve(__dirname, "oauth-login.ts"), "utf8");
    expect(
      service,
      "сервис OAuth-входа проставляет emailVerifiedAt — это вариант A (инв. #41)",
    ).not.toMatch(/emailVerifiedAt/);
  });
});

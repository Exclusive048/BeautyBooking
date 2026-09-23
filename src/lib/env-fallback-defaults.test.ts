/**
 * ENV-FALLBACK-DEFAULTS — провалившийся парс env не лишает переменные дефолтов.
 *
 * В CI `.env` нет, `DATABASE_URL=""` валит парс, и фолбэк отдавал сырой
 * `process.env`: `AUTH_COOKIE_NAME` был `undefined`, а `clearSessionCookies`
 * гасил куку с именем `"undefined"` — сессия переживала выход
 * (`proxy.test.ts` «выход по-прежнему убирает из запроса обе куки» краснел
 * только в CI). Здесь переменная снимается явно, поэтому тест не зависит от
 * того, есть ли на машине `.env`.
 *
 * @probe 2026-09-23 — фолбэк возвращён к сырому `process.env`: оба кейса
 * красные («expected undefined to be 'bh_session'» и Set-Cookie с именем
 * `undefined`). Возвращено — зелёный.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { clearSessionCookies } from "@/lib/auth/session";

describe("env — дефолты схемы при провалившемся парсе", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("незаданная переменная получает дефолт своего поля", () => {
    vi.stubEnv("AUTH_COOKIE_NAME", undefined);
    expect(env.AUTH_COOKIE_NAME).toBe("bh_session");
  });

  it("выход гасит сессионную куку по её настоящему имени", () => {
    vi.stubEnv("AUTH_COOKIE_NAME", undefined);
    const response = NextResponse.next();
    clearSessionCookies(response);
    const names = response.headers.getSetCookie().map((cookie) => cookie.split("=")[0]);
    expect(names).toContain("bh_session");
    expect(names).not.toContain("undefined");
  });
});

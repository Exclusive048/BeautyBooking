/**
 * PERF-13 — публичные справочники объявляют себя кэшируемыми, и это безопасно.
 *
 * Вторая половина теста — про то, чего не было в находке: прокси при протухшем
 * access-токене прикладывает обновлённую сессионную куку к ответу ЛЮБОГО
 * совпавшего пути, включая эти же справочники. `public, s-maxage=…` вместе с
 * `Set-Cookie` в разделяемом кэше — это выдача чужой сессии следующему
 * посетителю.
 *
 * Понизить директиву из прокси НЕЛЬЗЯ — заголовок обработчика выигрывает у
 * заголовка middleware (проверено рантаймом; юнит-тест этого не увидел бы, он
 * смотрит на собственный `NextResponse` прокси). Поэтому множества разведены
 * структурно: на `PUBLIC_REFERENCE_API_PATHS` обновление сессии не запускается
 * вовсе, и кука к кэшируемому ответу физически не может быть приложена.
 *
 * Не-вакуумность: прогонялось со снятым пропуском в `proxy.ts` — краснеют все
 * четыре пути; и с `publicReferenceCacheInit()`, убранным из
 * `reviews/tags/route.ts`, — краснеет его строка.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PUBLIC_REFERENCE_API_PATHS, PUBLIC_REFERENCE_CACHE_CONTROL } from "./cache-headers";

const checkRateLimit = vi.hoisted(() => vi.fn(async () => ({ limited: false, retryAfterSeconds: 0 })));
const verifyToken = vi.hoisted(() => vi.fn(() => null));
const rotateSessionWithTelemetry = vi.hoisted(() =>
  vi.fn(async (_response: { headers: Headers }, _refreshToken: string): Promise<boolean> => false),
);

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/auth/jwt", () => ({ verifyToken }));
vi.mock("@/lib/auth/session-refresh", () => ({ rotateSessionWithTelemetry }));

import { proxy } from "@/proxy";

/**
 * Роуты, чей ответ побайтово одинаков для анонима, клиента и админа. Список —
 * перечень тех, кому МОЖНО (модель `MASTER_CRM_READERS` из инв. #25): новый роут
 * с общим кэшем не попадёт сюда молча, а появление здесь роута, зависящего от
 * зрителя, — это уже сознательное решение человека.
 */
const PUBLIC_REFERENCE_ROUTES = [
  "src/app/api/catalog/global-categories/route.ts",
  "src/app/api/home/tags/route.ts",
  "src/app/api/reviews/tags/route.ts",
  "src/app/api/billing/plans/route.ts",
];

describe("PERF-13 · публичные справочники несут Cache-Control", () => {
  it.each(PUBLIC_REFERENCE_ROUTES)("%s отдаёт ответ через publicReferenceCacheInit", (route) => {
    const source = readFileSync(resolve(process.cwd(), route), "utf8");
    expect(source).toContain("@/lib/api/cache-headers");
    // Именно ВЫЗОВ, а не импорт: строка `publicReferenceCacheInit` есть и в
    // импорте, поэтому проверка на подстроку без скобок остаётся зелёной, если
    // helper импортировали и забыли применить (проверено — так и было).
    expect(source).toMatch(/publicReferenceCacheInit\(\)/);
  });

  it("директива разрешает разделяемый кэш и не блокирует холодный", () => {
    expect(PUBLIC_REFERENCE_CACHE_CONTROL).toContain("public");
    expect(PUBLIC_REFERENCE_CACHE_CONTROL).toContain("s-maxage=");
    expect(PUBLIC_REFERENCE_CACHE_CONTROL).toContain("stale-while-revalidate=");
  });

  it("список путей совпадает с набором роутов, ставящих заголовок", () => {
    const fromRoutes = PUBLIC_REFERENCE_ROUTES.map((route) =>
      route.replace(/^src\/app/, "").replace(/\/route\.ts$/, ""),
    );
    expect([...PUBLIC_REFERENCE_API_PATHS].sort()).toEqual(fromRoutes.sort());
  });
});

describe("PERF-13 · сессионная кука и разделяемый кэш — непересекающиеся множества", () => {
  beforeEach(() => {
    checkRateLimit.mockClear();
    rotateSessionWithTelemetry.mockReset();
    verifyToken.mockReturnValue(null); // протухший access-токен → обычно это ротация
  });

  it.each([...PUBLIC_REFERENCE_API_PATHS])(
    "%s: ротация не запускается, значит Set-Cookie к кэшируемому ответу не прикладывается",
    async (path) => {
      // Если бы ротация всё же вызвалась, она положила бы куку в carrier-ответ,
      // и та уехала бы в разделяемо-кэшируемый ответ.
      rotateSessionWithTelemetry.mockImplementation(async (carrier) => {
        carrier.headers.append(
          "set-cookie",
          "bh_session=fresh-access; Path=/; HttpOnly",
        );
        return true;
      });

      const res = await proxy(
        new NextRequest(`https://example.test${path}`, {
          method: "GET",
          headers: { cookie: "bh_session=stale-access; bh_refresh=refresh-token" },
        }),
      );

      expect(rotateSessionWithTelemetry).not.toHaveBeenCalled();
      expect(res.headers.get("set-cookie")).toBeNull();
    },
  );

  it("на обычном пути обновление сессии по-прежнему происходит (пропуск точечный, не глобальный)", async () => {
    rotateSessionWithTelemetry.mockImplementation(async (carrier) => {
      carrier.headers.append(
        "set-cookie",
        "bh_session=fresh-access; Path=/; HttpOnly",
      );
      return true;
    });

    const res = await proxy(
      new NextRequest("https://example.test/cabinet/master", {
        method: "GET",
        headers: { cookie: "bh_session=stale-access; bh_refresh=refresh-token" },
      }),
    );

    expect(rotateSessionWithTelemetry).toHaveBeenCalledTimes(1);
    expect(res.headers.get("set-cookie")).toContain("bh_session=fresh-access");
  });
});

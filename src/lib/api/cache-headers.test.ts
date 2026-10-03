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
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PUBLIC_REFERENCE_API_PATHS,
  PUBLIC_REFERENCE_CACHE_CONTROL,
  SESSION_REFRESHED_REQUEST_HEADER,
  sharedCacheControlFor,
} from "./cache-headers";
import { stripComments } from "@/lib/testing/source-scan";

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
  "src/app/api/cities/route.ts",
  "src/app/api/mobile/v1/config/route.ts",
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

/**
 * CITY-LIST-FRESH-01 — полнота списка выводится из ДЕРЕВА, а не из памяти.
 *
 * `PUBLIC_REFERENCE_ROUTES` выше — ручной перечень, и `/api/cities` прожил вне
 * него со своим `public, s-maxage=300`: прокси прикладывал к нему `Set-Cookie`.
 * Здесь обходятся все роуты `src/app/api`, и любой, кто объявляет
 * `Cache-Control: public…` литералом мимо `publicReferenceCacheInit()`, обязан
 * стоять в замороженном инвентаре ниже с причиной — и отдавать директиву
 * через `sharedCacheControlFor` (PUBLIC-CACHE-SET-COOKIE): на этих путях прокси
 * ротирует сессию, и `public`-ответ с приложенной кукой обязан стать `private`.
 *
 * @probe 2026-09-23 — `/api/cities` возвращён к литералу
 *        `"public, max-age=300, s-maxage=300"` без записи в инвентаре: красный
 *        с путём `src/app/api/cities/route.ts` в списке. Возвращено — зелёный.
 *        В `og/profile` снята обёртка `sharedCacheControlFor`: красный
 *        «роуты вне списка отдают public только через sharedCacheControlFor».
 */
const PUBLIC_CACHE_OUTSIDE_LIST: Record<string, string> = {
  // Медиа читает сессию на приватной ветке, поэтому из-под обновления сессии
  // эти пути не выводятся; разделяемый кэш снимает `sharedCacheControlFor`.
  "src/app/api/og/profile/route.tsx": "OG-картинка профиля, сессию не читает; вывод из-под refresh — отдельно",
  "src/app/api/media/file/[id]/route.ts": "публичная ветка медиа (MASTER/STUDIO/SITE); приватная сессию читает",
  // CROP-PUBLIC-01: тот же актив, что строкой выше, вырезанный по области, —
  // та же модель доступа и та же политика кэша; решается вместе с ним.
  "src/app/api/media/file/[id]/crop/[v]/route.ts": "вырез публичного аватара; близнец media/file/[id]",
};

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listRouteFiles(full));
    else if (/^route\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("CITY-LIST-FRESH-01 · public-кэш только через общий список", () => {
  it("ни один роут не объявляет public-кэш литералом вне инвентаря", () => {
    const root = resolve(process.cwd(), "src/app/api");
    const files = listRouteFiles(root);
    expect(files.length, "роуты не найдены — обход устарел").toBeGreaterThan(100);

    const offenders = files
      .map((file) => relative(process.cwd(), file).split("\\").join("/"))
      .filter((file) => /["'`]public,/.test(stripComments(readFileSync(resolve(process.cwd(), file), "utf8"))))
      .filter((file) => !(file in PUBLIC_CACHE_OUTSIDE_LIST))
      .sort();

    expect(offenders).toEqual([]);
  });

  it("роуты вне списка отдают public только через sharedCacheControlFor", () => {
    const unguarded = Object.keys(PUBLIC_CACHE_OUTSIDE_LIST).filter((file) => {
      const source = stripComments(readFileSync(resolve(process.cwd(), file), "utf8"));
      const literals = source.match(/["'`]public,/g)?.length ?? 0;
      const guarded = source.match(/sharedCacheControlFor\(\s*req\s*,\s*["'`]public,/g)?.length ?? 0;
      return literals === 0 || guarded !== literals;
    });
    expect(unguarded).toEqual([]);
  });
});

describe("PUBLIC-CACHE-SET-COOKIE · сигнал прокси «к ответу приложится сессия»", () => {
  const SIGNAL = `x-middleware-request-${SESSION_REFRESHED_REQUEST_HEADER}`;

  beforeEach(() => {
    rotateSessionWithTelemetry.mockReset();
    verifyToken.mockReturnValue(null);
  });

  it("ротация на медиа-пути передаёт обработчику сигнал", async () => {
    rotateSessionWithTelemetry.mockImplementation(async (carrier) => {
      carrier.headers.append("set-cookie", "bh_session=fresh-access; Path=/; HttpOnly");
      return true;
    });
    const res = await proxy(
      new NextRequest("https://example.test/api/media/file/cmasset00000000000000001", {
        method: "GET",
        headers: { cookie: "bh_session=stale-access; bh_refresh=refresh-token" },
      }),
    );
    expect(res.headers.get("set-cookie")).toContain("bh_session=fresh-access");
    expect(res.headers.get(SIGNAL)).toBe("1");
  });

  it("без ротации сигнала нет, а присланный клиентом снимается", async () => {
    const res = await proxy(
      new NextRequest("https://example.test/api/media/file/cmasset00000000000000001", {
        method: "GET",
        headers: { [SESSION_REFRESHED_REQUEST_HEADER]: "1" },
      }),
    );
    expect(rotateSessionWithTelemetry).not.toHaveBeenCalled();
    expect(res.headers.get(SIGNAL)).toBeNull();
  });

  it("обработчик по сигналу понижает директиву, без сигнала — оставляет", () => {
    const value = "public, max-age=31536000, immutable";
    expect(sharedCacheControlFor(new Request("https://example.test/x"), value)).toBe(value);
    expect(
      sharedCacheControlFor(
        new Request("https://example.test/x", { headers: { [SESSION_REFRESHED_REQUEST_HEADER]: "1" } }),
        value,
      ),
    ).toBe("private, no-store");
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

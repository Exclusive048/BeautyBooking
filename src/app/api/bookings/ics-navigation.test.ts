import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * FIX-B18 · ICS-NAVIGATION-ENVELOPE — маршрут, куда браузер ПРИХОДИТ, обязан
 * ответить местом, а не конвертом.
 *
 * Две половины, и обе нужны.
 *
 * **Поведение** — каждый исход `GET /api/bookings/[id]/ics` даёт навигацию, и
 * адрес возврата зависит от того, что роут знает о вызывающем: нет сессии →
 * `/login?next=<строка записи>`; всё остальное → список записей с `?focus=` и
 * ключом исхода. Проверяется разобранный `Location`, а не «позвали
 * `nextRedirect`»: последнее удовлетворилось бы редиректом куда угодно.
 *
 * **Полнота** — набор навигационных роутов ВЫВОДИТСЯ из дерева, а не
 * перечисляется. Урок FIX-B14 дословно: класс, определённый тремя именами
 * файлов, пропустил четвёртый. Здесь источников признака два, и они разные по
 * природе: (а) цель `<a href>` / `window.location` / `data-auth-url` в клиентском
 * коде, (б) роут, отдающий `Content-Disposition` (скачивание всегда приходит
 * навигацией, даже если ссылки в TSX нет). Новый роут любого из двух видов
 * попадёт в набор сам.
 *
 * @probe   что сломать (по одному, каждый раз с откатом и сверкой байт-в-байт):
 *   1. вернуть `fail("Запись не найдена.", 404, "NOT_FOUND")` вместо
 *      `backToBooking("not_found")` → 3 failed: «исход not_found ответил НЕ
 *      навигацией — заголовка Location нет (status 404, content-type
 *      application/json)», «возврат ведёт К ЗАПИСИ…» и производный пин
 *      «download-роут отвечает конвертом» с именем файла;
 *   2. в `ics-export-outcome.ts` заменить `CLIENT_BOOKINGS_PATH` на `/login`
 *      → 2 failed: «возврат ведёт не к записи: expected
 *      'https://example.test/login?focus=cm5q…' to contain '/cabinet/bookings'»
 *      и «после входа пользователь окажется не там, куда шёл»;
 *   3. вернуть атрибут `download` ссылке в `client-bookings-page.tsx`
 *      → 1 failed: «ссылка «В календарь» несёт download — браузер скачает цель
 *      редиректа (HTML-страницу) вместо перехода».
 *
 * ⚠️ Проба 1 нашла дефект в САМОМ сторо́же и он исправлен здесь же: у теста
 * «возврат ведёт К ЗАПИСИ» не было ведущего утверждения, и на envelope-ответе
 * он падал жалобой на типы («the given combination of arguments (null and
 * string) is invalid»), из которой не видно ни роута, ни причины. Ровно тот
 * промах, который FIX-B13 уже допускал однажды.
 */

const prismaFindUnique = vi.hoisted(() => vi.fn());
const getSessionUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: { booking: { findUnique: prismaFindUnique } } }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "https://example.test", APP_PUBLIC_URL: "" },
}));

import { GET as icsRoute } from "@/app/api/bookings/[id]/ics/route";

const BOOKING_ID = "cm5qz1a0b0000v3l8h2k9d1x7";
const OWNER = { id: "user-1" };

function call() {
  return icsRoute(new Request(`https://example.test/api/bookings/${BOOKING_ID}/ics`), {
    params: { id: BOOKING_ID },
  });
}

/** Разбирает ответ так, как его увидит браузер: место назначения или тупик. */
async function landing(res: Response) {
  const location = res.headers.get("location");
  return {
    status: res.status,
    location,
    contentType: res.headers.get("content-type"),
  };
}

const OUTCOMES: Array<{
  label: string;
  arrange: () => void;
  expectIn: string;
}> = [
  {
    label: "auth_required",
    arrange: () => {
      getSessionUser.mockResolvedValue(null);
    },
    expectIn: "/login?next=",
  },
  {
    label: "not_found",
    arrange: () => {
      getSessionUser.mockResolvedValue(OWNER);
      prismaFindUnique.mockResolvedValue(null);
    },
    expectIn: "ics=not_found",
  },
  {
    label: "forbidden",
    arrange: () => {
      getSessionUser.mockResolvedValue(OWNER);
      prismaFindUnique.mockResolvedValue({
        id: BOOKING_ID,
        clientUserId: "someone-else",
        startAtUtc: new Date(),
        endAtUtc: new Date(),
      });
    },
    expectIn: "ics=forbidden",
  },
  {
    label: "no_time",
    arrange: () => {
      getSessionUser.mockResolvedValue(OWNER);
      prismaFindUnique.mockResolvedValue({
        id: BOOKING_ID,
        clientUserId: OWNER.id,
        startAtUtc: null,
        endAtUtc: null,
      });
    },
    expectIn: "ics=no_time",
  },
  {
    label: "failed",
    arrange: () => {
      getSessionUser.mockResolvedValue(OWNER);
      prismaFindUnique.mockRejectedValue(new Error("db down"));
    },
    expectIn: "ics=failed",
  },
];

describe("FIX-B18 · каждый исход выгрузки в календарь — навигация", () => {
  for (const { label, arrange, expectIn } of OUTCOMES) {
    it(`${label} → браузер получает адрес, а не конверт`, async () => {
      vi.clearAllMocks();
      arrange();

      const result = await landing(await call());

      // Ведущее утверждение называет дефект: «это не навигация». Без него
      // сравнение ключа падало бы на `toContain(null, …)` — жалоба на типы,
      // из которой не видно ни роута, ни причины (промах, за который FIX-B13
      // уже заплатил однажды).
      expect(
        result.location,
        `исход ${label} ответил НЕ навигацией — заголовка Location нет ` +
          `(status ${result.status}, content-type ${result.contentType})`,
      ).toBeTruthy();
      expect([302, 303, 307, 308]).toContain(result.status);
      expect(result.location).toContain(expectIn);
    });
  }

  it("возврат ведёт К ЗАПИСИ, а не на /login голый", async () => {
    vi.clearAllMocks();
    getSessionUser.mockResolvedValue(OWNER);
    prismaFindUnique.mockResolvedValue(null);

    const result = await landing(await call());

    // Тот же порядок, что в таблице исходов: сначала «это вообще навигация?»,
    // и только потом — куда именно. Без ведущего утверждения `toContain(null)`
    // жалуется на типы, и из падения не видно ни роута, ни причины.
    expect(
      result.location,
      `отказ ответил НЕ навигацией — заголовка Location нет ` +
        `(status ${result.status}, content-type ${result.contentType})`,
    ).toBeTruthy();
    expect(result.location, "возврат ведёт не к записи").toContain("/cabinet/bookings");
    expect(result.location, "потерян deep-link на строку записи").toContain(
      `focus=${BOOKING_ID}`,
    );
  });

  it("нет сессии → /login несёт обратный путь к той же записи", async () => {
    vi.clearAllMocks();
    getSessionUser.mockResolvedValue(null);

    const { location } = await landing(await call());
    const next = new URL(location!, "https://example.test").searchParams.get("next");

    expect(next, "после входа пользователь окажется не там, куда шёл").toBe(
      `/cabinet/bookings?focus=${BOOKING_ID}`,
    );
  });

  it("успех остаётся файлом, а не навигацией (контроль не-вакуумности)", async () => {
    vi.clearAllMocks();
    getSessionUser.mockResolvedValue(OWNER);
    prismaFindUnique.mockResolvedValue({
      id: BOOKING_ID,
      clientUserId: OWNER.id,
      startAtUtc: new Date("2026-08-14T11:00:00.000Z"),
      endAtUtc: new Date("2026-08-14T12:00:00.000Z"),
      provider: { name: "Анна Соколова", address: "ул. Покровка, 22" },
      masterProvider: null,
      serviceItems: [{ titleSnapshot: "Маникюр" }],
      service: { name: "Маникюр" },
    });

    const res = await call();

    // Иначе «всё редиректит» удовлетворило бы утверждения выше.
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("location")).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

const SRC = join(process.cwd(), "src");
const API_ROOT = join(SRC, "app", "api");

function listFiles(dir: string, match: RegExp): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listFiles(full, match));
      continue;
    }
    if (match.test(entry)) out.push(full);
  }
  return out;
}

const rel = (file: string) => relative(process.cwd(), file).split(sep).join("/");

/** `/api/...`-цели, к которым клиентский код ведёт БРАУЗЕР, а не `fetch`. */
export function navigationTargetsInClientCode(source: string): string[] {
  const targets: string[] = [];
  const patterns = [
    /href=\{?[`"']((?:\/api\/)[^`"'${\s]*)/g,
    /location\.(?:href|assign)\s*\(?\s*=?\s*[`"']((?:\/api\/)[^`"'${\s]*)/g,
    /["']data-auth-url["']\s*,\s*[`"']((?:\/api\/)[^`"'${\s]*)/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) targets.push(m[1]!);
  }
  return targets;
}

/** Роут, у которого отказ обязан быть местом, а не конвертом. */
function routeAnswersWithNavigation(source: string): boolean {
  // Признак — отсутствие конвертных фабрик в файле. Форма, но здесь она честна:
  // поведенческая половина выше доказывает НАСТОЯЩИЙ роут, а этот пин отвечает
  // на другой вопрос — «не появилось ли новых навигационных роутов, которые
  // никто не проверял». Появление такого роута обязано быть замечено, даже
  // если поведенческого теста для него ещё не написали.
  return !/\b(?:fail|jsonFail)\s*\(/.test(source);
}

describe("FIX-B18 · производный пин: набор навигационных роутов", () => {
  const clientFiles = listFiles(SRC, /\.tsx$/);
  const navTargets = new Set<string>();
  for (const file of clientFiles) {
    if (/\.test\.tsx$/.test(file)) continue;
    for (const t of navigationTargetsInClientCode(readFileSync(file, "utf8"))) {
      navTargets.add(t);
    }
  }

  const downloadRoutes = listFiles(API_ROOT, /^route\.ts$/).filter((file) =>
    readFileSync(file, "utf8").includes("Content-Disposition"),
  );

  it("контроль машинерии: разборщик узнаёт навигацию и не ловит fetch", () => {
    const positive = `
      <a href="/api/bookings/x/ics" />
      window.location.assign("/api/integrations/vk/start");
      script.setAttribute("data-auth-url", "/api/auth/telegram/link");
    `;
    const negative = `
      const res = await fetch("/api/master/profile", { method: "PATCH" });
      useSWR("/api/cabinet/user/bookings?x=1", fetcher);
    `;
    expect(
      navigationTargetsInClientCode(positive).sort(),
      "разборщик перестал видеть навигацию — производный пин стал бы вакуумным",
    ).toEqual([
      "/api/auth/telegram/link",
      "/api/bookings/x/ics",
      "/api/integrations/vk/start",
    ]);
    expect(
      navigationTargetsInClientCode(negative),
      "разборщик считает fetch навигацией — набор наполнится шумом",
    ).toEqual([]);
  });

  it("набор навигационных целей не вырос молча", () => {
    // Заморожен инвентарь, а не число: дельта красная в обе стороны.
    // `/api/bookings/:id/ics` записан шаблоном — id подставляется в JSX.
    // VK-COMMUNITY-NOTIFY-01: `/api/integrations/vk/start` выбыл — секция
    // уведомлений ВКонтакте больше не подключает ВК сама, привязка идёт через
    // профиль (`/api/auth/vk/start`).
    // PHONE-OAUTH-PROOF-01: `/api/auth/yandex/start` — кнопка «Подтвердить
    // номер через Яндекс ID» в кабинете. Это стартовая нога OAuth: навигацию на
    // каждый исход держит тип `OAuthStartNavigation`
    // (`api/auth/oauth-start-navigation.test.ts`). Query-строка (`?verifyPhone=1`)
    // роут не меняет — сравнение идёт по пути.
    const FROZEN = [
      "/api/auth/vk/start",
      "/api/auth/yandex/start",
      "/api/auth/telegram/link",
      "/api/bookings/",
    ].sort();
    const normalized = [...navTargets]
      .map((t) => t.split("?")[0]!)
      .map((t) => (t.startsWith("/api/bookings/") ? "/api/bookings/" : t))
      .filter((t, i, a) => a.indexOf(t) === i)
      .sort();
    expect(
      normalized,
      "изменился набор /api-целей, к которым клиент ведёт БРАУЗЕР. Новая цель " +
        "обязана отвечать навигацией на КАЖДЫЙ исход (FIX-B14/FIX-B18), а не конвертом.",
    ).toEqual(FROZEN);
  });

  it("download-роуты (Content-Disposition) отвечают навигацией на отказ", () => {
    expect(
      downloadRoutes.map(rel),
      "набор download-роутов изменился — проверьте форму их отказов",
    ).toEqual(["src/app/api/bookings/[id]/ics/route.ts"]);

    const envelopeAnswering = downloadRoutes
      .filter((file) => !routeAnswersWithNavigation(readFileSync(file, "utf8")))
      .map(rel);
    expect(
      envelopeAnswering,
      `download-роут отвечает конвертом: ${envelopeAnswering.join(", ")}. ` +
        "Сюда приходит браузер по ссылке — JSON в окне это тупик.",
    ).toEqual([]);
  });

  it("ссылка «В календарь» не несёт download — иначе отказ скачается файлом", () => {
    const page = readFileSync(
      join(SRC, "features/client-cabinet/bookings/client-bookings-page.tsx"),
      "utf8",
    );
    const linkBlock = page.slice(
      page.indexOf("/api/bookings/${booking.id}/ics"),
      page.indexOf("/api/bookings/${booking.id}/ics") + 220,
    );
    expect(
      /\bdownload\b/.test(linkBlock),
      "ссылка «В календарь» несёт download — браузер скачает цель редиректа " +
        "(HTML-страницу) вместо перехода. Content-Disposition на успехе делает атрибут ненужным.",
    ).toBe(false);
  });
});

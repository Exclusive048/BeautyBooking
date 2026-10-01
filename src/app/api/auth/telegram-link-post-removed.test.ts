import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FIX-B18 · TELEGRAM-LINK-POST-DEAD — мёртвый `POST /api/auth/telegram/link`
 * удалён, и вернуться не должен.
 *
 * Класс тот же, что у SEC-09 (`profile/ensure`): поверхность, у которой ноль
 * вызывающих, но которая **разбирает вход и пишет в БД** — связывает Telegram-
 * идентичность с сессией внутри `$transaction`. Живой путь линкования —
 * `GET` в том же файле: виджет Telegram настроен на `data-auth-url`
 * (`telegram-connect-modal.tsx:51`), то есть НАВИГИРУЕТ браузер, а JSON туда
 * никто не шлёт.
 *
 * Удаление сторожится, а не подразумевается: файл роута остаётся на диске
 * (в нём живёт `GET`), поэтому «отсутствие файла» — не признак, как это было в
 * SEC-09. Признак здесь — отсутствие экспорта `POST` в конкретном модуле.
 *
 * ⚠️ Проверяется ЭКСПОРТ модуля, а не текст файла: Next маршрутизирует по
 * экспортам, поэтому именно их отсутствие означает «метода нет». Регексп по
 * исходнику удовлетворился бы закомментированным кодом и не заметил бы
 * `export { handler as POST }`.
 *
 * @probe   что сломать: дописать в `src/app/api/auth/telegram/link/route.ts`
 *          `export async function POST() { return new Response(null, { status: 204 }); }`
 *          наблюдалось: 1 failed — «POST вернулся на /api/auth/telegram/link:
 *          мёртвая поверхность, которая пишет в БД (класс SEC-09):
 *          expected [ 'GET', 'POST' ] to deeply equal [ 'GET' ]».
 */

const ROUTE_MODULE = "@/app/api/auth/telegram/link/route";
const ROUTE_FILE = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "app/api/auth/telegram/link/route.ts",
);

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

// TEST-TIMEOUT-FLAKE: динамический import() route-модуля под параллельной нагрузкой
// подходил к дефолтным 5 с (два красных из пяти полных прогонов).
describe("FIX-B18 · POST /api/auth/telegram/link удалён", { timeout: 30_000 }, () => {
  it("модуль экспортирует ровно GET — POST не вернулся", async () => {
    const mod: Record<string, unknown> = await import(ROUTE_MODULE);
    const exported = HTTP_METHODS.filter((method) => typeof mod[method] === "function");

    expect(
      exported,
      "POST вернулся на /api/auth/telegram/link: мёртвая поверхность, которая пишет в БД " +
        "(класс SEC-09). Живой путь линкования — GET (redirect-mode виджета).",
    ).toEqual(["GET"]);
  });

  it("контроль машинерии: список методов действительно читается из модуля", async () => {
    // Иначе первое утверждение зеленело бы и на пустом модуле — то есть при
    // ошибке импорта, а не при отсутствии POST.
    const mod: Record<string, unknown> = await import(ROUTE_MODULE);
    expect(typeof mod.GET, "GET исчез — тест измеряет не то, что думает").toBe("function");
  });

  it("тело POST не осталось в файле мёртвым кодом", () => {
    // Экспорта нет — но осиротевшая функция с той же логикой записи вернулась бы
    // одним словом `export`. Признак узкий и точный: транзакция линкования.
    const source = readFileSync(ROUTE_FILE, "utf8");
    const linkTransactions = source.match(/prisma\.\$transaction\(/g) ?? [];
    expect(
      linkTransactions.length,
      "в файле больше одной транзакции линкования — вероятно, тело удалённого POST осталось рядом с GET",
    ).toBe(1);
  });
});

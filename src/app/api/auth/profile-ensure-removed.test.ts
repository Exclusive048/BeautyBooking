import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * SEC-09 — `POST /api/auth/profile/ensure` удалён, и вернуться не должен.
 *
 * Роут делал `userProfile.upsert` по `payload.sub` из access-токена и писал
 * `phone` из того же токена. Две последствия, обе тяжёлые:
 *
 *   1. **Удаление аккаунта переставало быть окончательным.** `delete-account`
 *      обнуляет `phone` и ставит `isDeleted`, но `upsert` не фильтровал
 *      `isDeleted` и возвращал телефон на анонимизированную строку. Access-
 *      токен живёт 2 часа и серверной отзывной проверки не имеет, так что
 *      окно реальное: удалился → в течение двух часов дёрнул роут → телефон
 *      снова в базе (152-ФЗ).
 *   2. **`create`-ветка заводила `UserProfile` в обход единственного writer'а
 *      согласий** (`recordUserConsents`), то есть в обход инварианта #37
 *      «аккаунт не создаётся без согласий».
 *
 * Роут был мёртв: ноль вызывающих в `src/`, `.qa/`, `scripts/` — только
 * запись-исключение в openapi-allowlist. Поэтому выбран не патч, а удаление.
 *
 * Тест сторожит именно возврат: файл легко восстановить из истории git, и
 * тогда обе дыры вернутся вместе с ним.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..", "..");

describe("SEC-09 · мёртвый profile/ensure не возвращается", () => {
  it("файла роута нет", () => {
    const routeFile = resolve(
      PROJECT_ROOT,
      "src/app/api/auth/profile/ensure/route.ts",
    );
    expect(existsSync(routeFile)).toBe(false);
  });

  it("исключение из openapi-allowlist снято — иначе роут вернётся молча", () => {
    const allowlist = readFileSync(
      resolve(PROJECT_ROOT, "scripts/openapi-route-allowlist.txt"),
      "utf8",
    );
    expect(allowlist).not.toContain("/api/auth/profile/ensure");
  });
});

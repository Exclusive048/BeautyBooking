import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/api/errors";
import { toAuthSurfaceError } from "@/lib/auth/auth-surface-error";

/**
 * FIX-C6 · SECURITY-EXPOSURE-AUDIT-01 · Y9 — проба типа, снявшего с
 * auth-границы канал утечки диагностики.
 *
 * Прежде правило держал регексп `DETAILS_FORWARD` по строкам файла, и FIX-C5
 * честно записал, каких форм он не видит. Главная из них — **собрать аргумент
 * до вызова**; она же побеждала остальные четыре детектора кампании. Теперь
 * прокидывать нечего: у вида, который держит в руках catch auth-поверхности,
 * поля `details` нет — ни для прямого чтения, ни после спреда.
 *
 * @probe   что сломать: дописать `readonly details?: unknown` в
 *          `AuthSurfaceError` и вернуть `details: appError.details` из
 *          `toAuthSurfaceError`.
 *          наблюдалось: `npm run typecheck` красный — 3 × «Unused
 *          '@ts-expect-error' directive» в блоке ниже, то есть все три формы
 *          обхода снова компилируются и проба это показывает.
 */

describe("FIX-C6 · toAuthSurfaceError сужает ошибку до тела ответа", () => {
  it("переносит курируемое сообщение, статус и код `AppError`", () => {
    const view = toAuthSurfaceError(
      new AppError("Не удалось отвязать VK. Попробуйте ещё раз.", 409, "VK_ALREADY_LINKED", {
        access_token: "vk1.a.SUPER_SECRET",
      }),
    );

    expect(view).toEqual({
      message: "Не удалось отвязать VK. Попробуйте ещё раз.",
      status: 409,
      code: "VK_ALREADY_LINKED",
    });
  });

  it("🔴 диагностики нет и в РАНТАЙМЕ — спред вида не может её вынести", () => {
    // Не дублирование типовой пробы: тип защищает от чтения `.details`, а это —
    // от `JSON.stringify(view)` / `{ ...view }` в теле ответа. Без проверки
    // ключей лишнее поле уехало бы молча, будучи невидимым для компилятора
    // (объект шире типа — это законно).
    const view = toAuthSurfaceError(
      new AppError("boom", 500, "INTERNAL_ERROR", { refresh_token: "SUPER_SECRET" }),
    );

    expect(Object.keys(view).sort()).toEqual(["code", "message", "status"]);
    expect(JSON.stringify(view)).not.toContain("SUPER_SECRET");
  });

  it("сырую ошибку приводит тем же резолвером, что и раньше", () => {
    const view = toAuthSurfaceError(new Error("boom"));
    expect(view.status).toBe(500);
    expect(typeof view.code).toBe("string");
  });
});

/* ------------------------------------------------------------------ *
 * Проба: форма обхода, побеждавшая детектор, — аргумент собран заранее.
 * ------------------------------------------------------------------ */

/** Модель конверта проекта: у `fail`/`jsonFail` диагностика — 4-й аргумент. */
declare function envelope(
  message: string,
  status: number,
  code: string,
  details?: unknown,
): Response;

/**
 * Функция никогда не вызывается: предмет — сам факт того, что тело не
 * компилируется без директив.
 *
 * 🔴 Стандарт пробы (инв. #43, уточнение FIX-C5): берётся ПРАВДОПОДОБНАЯ форма
 * дефекта. Правдоподобная здесь — не «кто-то напишет `jsonFail(…, e.details)` в
 * одну строку» (это детектор и ловил), а промежуточная переменная и спред:
 * именно так пишут, когда рядом надо и залогировать, и ответить.
 */
function _detailsForwardEvasion(error: unknown): Response {
  const view = toAuthSurfaceError(error);

  // Форма 1 — прямое чтение поля.
  // @ts-expect-error Y9: у вида auth-границы нет `details` — прокидывать нечего.
  void view.details;

  // Форма 2 — АРГУМЕНТ СОБРАН ЗАРАНЕЕ. Детектор искал `.details` внутри скобок
  // вызова конверта; здесь чтение и вызов на разных строках.
  // @ts-expect-error Y9: поля нет — ни на своей строке, ни на чужой.
  const payload = view.details;

  // Форма 3 — спред: «вынести всё, что есть». Раньше именно она уносила бы
  // диагностику вложенной, минуя любой построчный поиск.
  const copy = { ...view };
  // @ts-expect-error Y9: копия вида пуста на этот счёт по построению.
  void copy.details;

  return envelope(view.message, view.status, view.code, payload);
}

void _detailsForwardEvasion;

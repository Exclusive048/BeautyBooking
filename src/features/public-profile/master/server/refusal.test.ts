import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/api/errors";
import { emptyOnRefusal } from "./refusal";

/**
 * 29.09 доработки · 13 — секции публичной страницы читают сервисы напрямую.
 * Отказ 4xx — «пусто» (как не-2xx HTTP-ответ раньше); отказ базы и прочие
 * исключения — наверх, в «Не удалось загрузить блок», а не «отзывов нет».
 */
describe("emptyOnRefusal", () => {
  it("значение сервиса — как есть", async () => {
    expect(await emptyOnRefusal(async () => [1, 2], [])).toEqual([1, 2]);
  });

  it("4xx AppError — пусто", async () => {
    const read = async (): Promise<string | null> => {
      throw new AppError("Профиль не найден.", 404, "PROVIDER_NOT_FOUND");
    };
    expect(await emptyOnRefusal(read, null)).toBeNull();
  });

  it("5xx AppError и чужое исключение — наверх", async () => {
    await expect(
      emptyOnRefusal(async () => {
        throw new AppError("Сбой.", 500, "INTERNAL_ERROR");
      }, []),
    ).rejects.toMatchObject({ status: 500 });
    await expect(
      emptyOnRefusal(async () => {
        throw new Error("connection refused");
      }, []),
    ).rejects.toThrow("connection refused");
  });
});
